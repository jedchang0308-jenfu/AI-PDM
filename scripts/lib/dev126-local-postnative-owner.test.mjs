import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runDev126LocalPostnativeOwner } from './dev126-local-postnative-owner.mjs'

const ROLE_CODES = ['system_admin', 'pdm_admin', 'rd_manager', 'production_planning', 'qa', 'rd',
  'manufacturing', 'procurement', 'external_specialist']
const SANDBOX_ID = 'd126-postnative-test'
const DATABASE_NAME = `jenfu_local_${SANDBOX_ID.replaceAll('-', '_')}`
const GENERATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PORT = 55432
const BASELINE_ID = 'dev126-initial-v2'
const REVISION = 'b'.repeat(40)
const FIXTURE = { fixtureVersion: 'dev126-fixture-v1', fixtureHash: 'c'.repeat(64) }
const LOGIN_PASSWORD = 'd'.repeat(64)

function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function digest(value) { return sha256(JSON.stringify(value)) }
async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
}

async function treeSnapshot(root) {
  const result = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const relative = path.relative(root, file).replaceAll(path.sep, '/')
      if (entry.isDirectory()) {
        result.push([relative, 'directory'])
        await visit(file)
      } else {
        result.push([relative, sha256(await readFile(file))])
      }
    }
  }
  await visit(root)
  return result.sort(([left], [right]) => left.localeCompare(right))
}

async function makeSandbox(t, { withReference = true, withBaseline = true, withSeedLogin = true,
  sessionCount = 0, bindingCount = 0, marker } = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'dev126-postnative-owner-'))
  t.after(async () => {
    const resolved = path.resolve(tempRoot)
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith('dev126-postnative-owner-')) {
      throw new Error('POSTNATIVE_TEST_TEMP_PATH_INVALID')
    }
    await rm(resolved, { recursive: true, force: true })
  })

  const root = path.join(tempRoot, 'sandbox')
  const platformRoot = path.join(tempRoot, 'platform')
  const control = path.join(root, 'control')
  const baselineDirectory = path.join(control, 'dev126-reset-baselines', BASELINE_ID)
  await mkdir(path.join(root, 'data'), { recursive: true })
  await mkdir(path.join(root, 'repository'))
  await mkdir(control)
  await mkdir(path.join(platformRoot, 'contracts', 'local-principal-sandbox', 'v1'), { recursive: true })
  await mkdir(path.join(platformRoot, 'scripts', 'lib'), { recursive: true })

  await writeFile(path.join(platformRoot, 'contracts', 'local-principal-sandbox', 'v1', 'protocol.mjs'), `
    import { createHash } from 'node:crypto'
    export const contractDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
    export function assertFixtureEnvelope(value) {
      if (value.fixtureVersion !== '${FIXTURE.fixtureVersion}' || value.fixtureHash !== '${FIXTURE.fixtureHash}') {
        throw Object.assign(new Error('FIXTURE_INVALID'), { code: 'FIXTURE_INVALID' })
      }
      return value
    }
  `)
  await writeFile(path.join(platformRoot, 'scripts', 'lib', 'dev021-local-principal-suite.mjs'), `
    export function createLocalPrincipalSuiteServices() {
      return [{ name: 'Local ai-pdm', env: { PDM_DATABASE_URL: 'postgres://127.0.0.1:${PORT}/${DATABASE_NAME}' } }]
    }
  `)

  const secrets = ['runtime-platform', 'runtime-orgmaster', 'runtime-pdm', 'runtime-fms',
    'key-orgmaster', 'key-pdm', 'key-fms', 'session-pepper', 'fixture-key'].map(value => sha256(value))
  const input = {
    format: 'jenfu.local-principal-bootstrap-input.v1', sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME, generation: GENERATION,
    runtimeLogins: {
      platform: { username: 'local_platform_runtime_d021_20261029', password: '1'.repeat(64) },
      orgmaster: { username: 'local_orgmaster_runtime_d060_20261029', password: '2'.repeat(64) },
      'ai-pdm': { username: 'local_pdm_runtime_d126_20261029', password: '3'.repeat(64) },
      fms: { username: 'fms_test_runtime_dev069_20261029', password: '4'.repeat(64) },
    },
    clientKeys: { orgmaster: secrets[4], 'ai-pdm': secrets[5], fms: secrets[6] },
    sessionHashPepper: secrets[7], fixtureControllerKey: secrets[8],
  }
  await writeJson(path.join(control, 'bootstrap-input.json'), input)
  await writeJson(path.join(control, 'native-bootstrap-result.json'), {
    status: 'source-profile-and-database-readback-verified', sandboxId: SANDBOX_ID, generation: GENERATION,
  })
  await writeJson(path.join(control, 'fixtures.json'), FIXTURE)
  const policy = { format: 'ai-pdm.local-role-priority.v1', sandboxId: SANDBOX_ID,
    roleCodes: ROLE_CODES, sha256: '' }
  policy.sha256 = digest({ format: policy.format, sandboxId: policy.sandboxId, roleCodes: policy.roleCodes })
  await writeJson(path.join(control, 'pdm-local-priority-policy.json'), policy)

  const login = { sandboxId: SANDBOX_ID, generation: GENERATION, databaseName: DATABASE_NAME,
    port: PORT, username: 'local_pdm_seed_0123456789abcdef', password: LOGIN_PASSWORD }
  if (withSeedLogin) await writeJson(path.join(control, 'pdm-baseline-owner-login.json'), login)

  const fingerprint = digest({ applicationId: 'ai-pdm', sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME, sandboxRoot: root, dataDirectory: path.join(root, 'data'),
    repositoryDirectory: path.join(root, 'repository'), generation: GENERATION,
    fixtureVersion: FIXTURE.fixtureVersion, fixtureHash: FIXTURE.fixtureHash,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2' })
  const reference = { baselineId: BASELINE_ID, manifestSha256: 'a'.repeat(64), stateDigest: 'e'.repeat(64),
    targetFingerprint: fingerprint, generation: GENERATION, sourceRevision: REVISION }
  if (withReference) await writeJson(path.join(control, 'pdm-baseline-reference.json'), reference)
  if (withBaseline) {
    await mkdir(baselineDirectory, { recursive: true })
    await writeJson(path.join(baselineDirectory, 'manifest.json'), {
      database: { includedRelations: ['companies'], principalSessionCount: 0, principalBindingCount: 0,
        ownerConnection: {}, runtimeTargetObservation: { connection: {} } },
      databaseDump: { bytes: 1 },
      repository: { objects: [] },
    })
  }

  const adminQueries = []
  const observedMarker = marker ?? `jenfu.local-principal-bootstrap.v1:${SANDBOX_ID}:${GENERATION}`
  class Client {
    constructor(options) { this.options = options }
    async connect() {}
    async end() {}
    async query(sql) {
      const query = String(sql).trim()
      adminQueries.push(query)
      assert.match(query, /^SELECT\b/iu, 'native verifier must use read-only admin statements')
      if (/^SELECT current_database\(\)/iu.test(query)) return { rows: [{ database_name: DATABASE_NAME,
        session_user: 'postgres', host: '127.0.0.1', port: PORT, marker: observedMarker }] }
      if (query.includes('principal_session_records')) return { rows: [{ sessions: sessionCount, bindings: bindingCount }] }
      if (query.includes('FROM pg_catalog.pg_auth_members')) return { rows: [{ rolname: 'jenfu_ai_pdm_migrator' }] }
      if (query.includes('FROM pg_catalog.pg_roles WHERE rolname=$1')) return { rows: [{ rolcanlogin: true,
        rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false }] }
      throw new Error('POSTNATIVE_TEST_UNEXPECTED_QUERY')
    }
  }

  const calls = { inspect: 0, verify: 0, capture: 0, seedPasswordHash: null }
  const suite = { root, applications: {
    platform: { worktree: platformRoot }, 'ai-pdm': { worktree: process.cwd() },
  } }
  const platform = {
    Client,
    async inspectCluster() {
      calls.inspect += 1
      return { postmaster: { port: PORT }, adminConnection: { host: '127.0.0.1', port: PORT, user: 'postgres' } }
    },
    async readSuite() { return suite },
  }
  const ownerTools = {
    snapshotOwnerFactory({ environment }) {
      calls.seedPasswordHash = sha256(environment.PGPASSWORD ?? '')
      return Object.freeze({})
    },
    runtimeTargetReaderFactory() { return Object.freeze({ async readCurrentTarget() { throw new Error('not called by stub verifier') } }) },
    baselineFunctions: {
      async verify() {
        calls.verify += 1
        return { baselineId: BASELINE_ID, manifestSha256: reference.manifestSha256,
          stateDigest: reference.stateDigest, targetFingerprint: fingerprint,
          generation: GENERATION, sourceRevision: REVISION, directory: baselineDirectory }
      },
      async capture() { calls.capture += 1; throw new Error('unexpected capture') },
    },
  }
  const run = (options = {}) => runDev126LocalPostnativeOwner({ stage: 'native-baseline', root,
    taskRoot: tempRoot, verifyOnly: true, dependencies: { platformRoot, platform, Client,
      ownerTools, gitHead() { throw new Error('verify-only must reuse pinned source revision') } }, ...options })

  return { root, tempRoot, platformRoot, control, baselineDirectory, login, reference, fingerprint,
    adminQueries, calls, platform, ownerTools, run }
}

test('native verify-only reads the pinned baseline and retains all private seed inputs without writing', async t => {
  const fixture = await makeSandbox(t)
  const before = await treeSnapshot(fixture.root)
  const result = await fixture.run()
  assert.equal(result.status, 'verified')
  assert.equal(fixture.calls.verify, 1)
  assert.equal(fixture.calls.capture, 0)
  assert.equal(fixture.calls.seedPasswordHash, sha256(LOGIN_PASSWORD))
  assert.ok(fixture.adminQueries.length >= 4)
  assert.ok(fixture.adminQueries.every(query => /^SELECT\b/iu.test(query)))
  assert.equal(JSON.stringify(result).includes(LOGIN_PASSWORD), false)
  assert.deepEqual(await treeSnapshot(fixture.root), before)
})

test('native verification fails closed when the immutable baseline reference is missing', async t => {
  const fixture = await makeSandbox(t, { withReference: false, withBaseline: false })
  const before = await treeSnapshot(fixture.root)
  await assert.rejects(fixture.run(), { code: 'BASELINE_REFERENCE_MISSING' })
  assert.equal(fixture.calls.inspect, 0)
  assert.equal(fixture.calls.verify, 0)
  assert.deepEqual(await treeSnapshot(fixture.root), before)
  await assert.rejects(lstat(path.join(fixture.control, 'dev126-reset-baselines')), { code: 'ENOENT' })
})

test('native verify-only refuses a nonempty session registry before owner snapshot readback', async t => {
  const fixture = await makeSandbox(t, { sessionCount: 1 })
  const before = await treeSnapshot(fixture.root)
  await assert.rejects(fixture.run(), { code: 'PDM_BASELINE_TARGET_HAS_SESSIONS' })
  assert.equal(fixture.calls.verify, 0)
  assert.equal(fixture.calls.seedPasswordHash, null)
  assert.deepEqual(await treeSnapshot(fixture.root), before)
})

test('business verify-only calls the read-only owner and creates no login or receipt', async t => {
  const fixture = await makeSandbox(t)
  const queries = []
  const calls = { verify: 0, initialize: 0, connects: 0 }
  class VerifyClient {
    constructor(options) { this.options = options }
    async connect() { calls.connects += 1 }
    async end() {}
    async query(sql) {
      const query = String(sql).trim()
      queries.push(query)
      if (/^SELECT current_database\(\)/iu.test(query)) return { rows: [{ database_name: DATABASE_NAME,
        session_user: 'postgres', host: '127.0.0.1', port: PORT,
        marker: `jenfu.local-principal-bootstrap.v1:${SANDBOX_ID}:${GENERATION}` }] }
      if (query.includes('principal_session_records')) return { rows: [{ sessions: 0, bindings: 0 }] }
      if (query === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' || query === 'SET LOCAL ROLE jenfu_ai_pdm_migrator' ||
        query === 'COMMIT' || query === 'ROLLBACK') return { rows: [], rowCount: null }
      if (query === 'SELECT true') return { rows: [{ '?column?': true }] }
      throw new Error(`BUSINESS_VERIFY_TEST_UNEXPECTED_QUERY:${query}`)
    }
  }
  const material = { companyId: 'company-jenfu',
    catalogProjection: { catalogVersion: 'catalog-v1', roleCount: 9, permissionCount: 10 },
    rolePriority: { versionCode: 'priority-v1', priority: ROLE_CODES, policySha256: 'f'.repeat(64) },
    workbenchAuthority: { id: 1, mode: 'canonical_only', expectedCommit: 'local-dev',
      schemaHash: 'dev090-v1', rowVersion: 5, switchedAt: '2026-10-30T00:01:00.000Z' },
    metadata: { status: 'ready', targetFingerprint: 'e'.repeat(64) } }
  const businessBaselineOwner = {
    dev126LocalBusinessBaselineResultMaterial() { return material },
    async verifyDev126LocalBusinessBaseline(input) {
      calls.verify += 1
      assert.equal(input.scopedMigratorSessionUser, 'postgres')
      assert.equal(input.client.options.user, 'postgres')
      await input.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await input.client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await input.client.query('SELECT true')
      await input.client.query('COMMIT')
      return { company: { companyId: 'company-jenfu' },
        catalogProjection: { catalogVersion: 'catalog-v1', roleCount: 9, permissionCount: 10 },
        rolePriority: { versionCode: 'priority-v1', priority: ROLE_CODES, policySha256: 'f'.repeat(64) },
        workbenchAuthority: { id: 1, mode: 'canonical_only', expectedCommit: 'local-dev',
          schemaHash: 'dev090-v1', rowVersion: 5, switchedAt: '2026-10-30T00:01:00.000Z' },
        metadata: { status: 'ready', targetFingerprint: 'e'.repeat(64) } }
    },
    async initializeDev126LocalBusinessBaseline() { calls.initialize += 1; throw new Error('capture must not run') },
  }
  const before = await treeSnapshot(fixture.root)
  const result = await runDev126LocalPostnativeOwner({ stage: 'business-baseline', root: fixture.root,
    taskRoot: fixture.tempRoot, verifyOnly: true, dependencies: { platformRoot: fixture.platformRoot,
      platform: fixture.platform, Client: VerifyClient, businessBaselineOwner } })

  assert.equal(result.status, 'verified')
  assert.match(result.resultDigest, /^[a-f0-9]{64}$/u)
  assert.deepEqual(calls, { verify: 1, initialize: 0, connects: 1 })
  assert.equal(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'), true)
  assert.equal(queries.some(query => /^(CREATE|GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE)\b/iu.test(query)), false)
  assert.deepEqual(await treeSnapshot(fixture.root), before)
})

test('capture refuses a nonempty session registry before creating the retained seed login', async t => {
  const fixture = await makeSandbox(t, { withReference: false, withBaseline: false, withSeedLogin: false,
    sessionCount: 1 })
  await assert.rejects(runDev126LocalPostnativeOwner({ stage: 'native-baseline', root: fixture.root,
    taskRoot: fixture.tempRoot, dependencies: {
      platformRoot: fixture.platformRoot,
      platform: { ...fixture.platform, inspectCluster: async () => {
        fixture.calls.inspect += 1
        return { postmaster: { port: PORT }, adminConnection: { host: '127.0.0.1', port: PORT, user: 'postgres' } }
      } },
      Client: fixture.platform.Client,
      ownerTools: { ...fixture.ownerTools, baselineFunctions: {
        verify: fixture.ownerTools.baselineFunctions.verify,
        capture: async () => { fixture.calls.capture += 1; throw new Error('unexpected capture') },
      } },
    } }), { code: 'PDM_BASELINE_TARGET_HAS_SESSIONS' })
  await assert.rejects(lstat(path.join(fixture.control, 'pdm-baseline-owner-login.json')), { code: 'ENOENT' })
  assert.equal(fixture.calls.capture, 0)
})

test('capture rejects a target marker mismatch before creating the retained seed login', async t => {
  const fixture = await makeSandbox(t, { withReference: false, withBaseline: false, withSeedLogin: false,
    marker: 'jenfu.local-principal-bootstrap.v1:another-sandbox:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
  await assert.rejects(runDev126LocalPostnativeOwner({ stage: 'native-baseline', root: fixture.root,
    taskRoot: fixture.tempRoot, dependencies: {
      platformRoot: fixture.platformRoot,
      platform: { ...fixture.platform, inspectCluster: async () => {
        fixture.calls.inspect += 1
        return { postmaster: { port: PORT }, adminConnection: { host: '127.0.0.1', port: PORT, user: 'postgres' } }
      } },
      Client: fixture.platform.Client,
      ownerTools: { ...fixture.ownerTools, baselineFunctions: {
        verify: fixture.ownerTools.baselineFunctions.verify,
        capture: async () => { fixture.calls.capture += 1; throw new Error('unexpected capture') },
      } },
    } }), { code: 'TARGET_MISMATCH' })
  await assert.rejects(lstat(path.join(fixture.control, 'pdm-baseline-owner-login.json')), { code: 'ENOENT' })
  assert.equal(fixture.calls.capture, 0)
})
