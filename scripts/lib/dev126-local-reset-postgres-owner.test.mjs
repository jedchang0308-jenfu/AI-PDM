import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DEV126_LOCAL_RESET_BASELINE_POLICY } from './dev126-local-reset-baseline-owner.mjs'
import {
  createDev126LocalPostgresSnapshotOwner,
  DEV126_LOCAL_POSTGRES_SNAPSHOT_OWNER_POLICY,
} from './dev126-local-reset-postgres-owner.mjs'

const OWNER = DEV126_LOCAL_RESET_BASELINE_POLICY.ownerRole
const RUNTIME = 'jenfu_ai_pdm_runtime'
const DATABASE = 'jenfu_local_dev126_owner_test'
const SANDBOX = 'dev126-owner-test'
const GENERATION = '00000000-0000-4000-8000-000000000126'
const FINGERPRINT = 'a'.repeat(64)
const FIXTURE_HASH = 'f'.repeat(64)
const PASSWORD = 'fixture-secret-never-argv'
const CONTROL = DEV126_LOCAL_RESET_BASELINE_POLICY.controlRelations
const POINTER_SOURCES = DEV126_LOCAL_RESET_BASELINE_POLICY.pointerSources

function makeInput(overrides = {}) {
  const sandboxRoot = path.join(os.tmpdir(), 'aipdm-dev126-postgres-owner', SANDBOX)
  const dataDirectory = path.join(sandboxRoot, 'data')
  const repositoryDirectory = path.join(sandboxRoot, 'repository')
  const target = {
    applicationId: 'ai-pdm', sandboxId: SANDBOX, databaseName: DATABASE,
    sandboxRoot, dataDirectory, repositoryDirectory,
    generation: GENERATION, targetFingerprint: FINGERPRINT,
  }
  const targetMetadata = {
    applicationId: 'ai-pdm', sandboxId: SANDBOX, databaseName: DATABASE,
    sandboxRoot, dataDirectory, repositoryDirectory,
    generation: GENERATION, fixtureVersion: 'jenfu.local-principal-fixtures.v1', fixtureHash: FIXTURE_HASH,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2', targetFingerprint: FINGERPRINT, status: 'ready',
  }
  const scope = {
    schema: 'ai_pdm_core', dumpFormat: 'custom', dataOnly: true,
    includeAllOwnedTablesExceptControlRelations: true,
    excludedTableData: CONTROL.map((name) => `ai_pdm_core.${name}`),
    pointerSources: POINTER_SOURCES, consistency: 'single-exported-postgresql-snapshot',
    excludeOwnerAndPrivileges: true,
  }
  return {
    target,
    expectedDatabase: {
      databaseName: DATABASE, runtimeRole: RUNTIME, databaseHost: '127.0.0.1', databasePort: 15432,
      sandboxId: SANDBOX, generation: GENERATION, targetFingerprint: FINGERPRINT,
    },
    runtimeTargetObservation: {
      connection: {
        databaseName: DATABASE, currentUser: RUNTIME, sessionUser: RUNTIME,
        serverAddress: '127.0.0.1', serverPort: 15432,
      },
      targetMetadata,
    },
    scope,
    ...overrides,
  }
}

function makeHarness(options = {}) {
  const input = makeInput(options.inputOverrides)
  const events = []
  const queries = []
  const pools = []
  const spawns = []
  const targetRow = {
    application_id: 'ai-pdm', sandbox_id: SANDBOX, database_name: DATABASE,
    sandbox_root: input.target.sandboxRoot, data_directory: input.target.dataDirectory,
    repository_directory: input.target.repositoryDirectory, generation: GENERATION,
    fixture_version: 'jenfu.local-principal-fixtures.v1', fixture_hash: FIXTURE_HASH,
    native_session_contract_version: 'jenfu.ai-pdm-session.v2', target_fingerprint: FINGERPRINT, status: 'ready',
    ...options.targetRow,
  }
  const controls = new Set(CONTROL)
  const relationNames = ['companies', 'file_assets', 'parts', ...CONTROL]
    .filter((name) => name !== options.missingRelation)
    .sort()
  const relationOwner = options.relationOwner ?? OWNER
  const pointerRows = options.pointerRows ?? ((table) => table === 'file_assets' ? [{
    source_id: 'asset-1', provider: 'local_repository', key: 'assets/sample.pdf',
    legacy_path: null, sha256: 'b'.repeat(64), bytes: '17',
  }] : [])

  const client = {
    async query(sql, values = []) {
      const normalized = sql.trim()
      queries.push({ sql: normalized, values })
      if (normalized.startsWith('BEGIN ')) return { rows: [] }
      if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        events.push(normalized)
        return { rows: [] }
      }
      if (normalized.includes('current_database()')) return { rows: [options.connection ?? {
        database_name: DATABASE, current_user: OWNER, session_user: OWNER,
        server_address: '127.0.0.1', server_port: 15432,
      }] }
      if (normalized === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] }
      if (normalized.includes('pg_export_snapshot')) return { rows: [{ snapshot_id: '00000003-00000001-1' }] }
      if (normalized.includes('FROM pg_catalog.pg_namespace')) {
        return { rows: [{ schema_owner: options.schemaOwner ?? OWNER }] }
      }
      if (normalized.includes('FROM ai_pdm_core.local_sandbox_target_metadata')) return { rows: [targetRow] }
      if (normalized.includes('FROM ai_pdm_core.pdm_workbench_state_authority_control')) {
        return { rows: [{ mode: 'canonical_only', expected_commit: 'local-dev', schema_hash: 'c'.repeat(64),
          row_version: 3, switched_at: '2026-10-30T00:00:00.000Z' }] }
      }
      if (normalized.includes('principal_session_records') && normalized.includes('local_sandbox_principal_session_bindings')) {
        return { rows: [{ principal_session_count: String(options.principalSessionCount ?? 0),
          principal_binding_count: String(options.principalBindingCount ?? 0) }] }
      }
      if (normalized.includes('FROM pg_catalog.pg_class')) {
        return { rows: relationNames.map((name) => ({ name, kind: options.foreignTable === name ? 'f' : 'r', owner: relationOwner })) }
      }
      if (normalized.includes('to_jsonb(t)::text')) {
        const name = normalized.match(/ai_pdm_core\."([a-z][a-z0-9_]*)"/u)?.[1]
        assert.ok(name, `relation summary is constrained to a quoted ai_pdm_core relation: ${normalized}`)
        return { rows: controls.has(name) ? [] : [{ row_json: `{"id":"${name}-1"}` }] }
      }
      for (const table of POINTER_SOURCES) {
        if (normalized.includes(`FROM ai_pdm_core.${table}`)) return { rows: pointerRows(table) }
      }
      throw new Error(`UNEXPECTED_STUB_QUERY:${normalized}`)
    },
    release() { events.push('release') },
  }

  function Pool(poolOptions) {
    pools.push(poolOptions)
    return {
      async connect() { return client },
      async end() { events.push('pool-end') },
    }
  }

  function spawn(executable, args, spawnOptions) {
    spawns.push({ executable, args, options: spawnOptions })
    events.push('spawn')
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => { events.push('kill'); return true }
    setImmediate(() => {
      child.stdout.end(Buffer.from('stub custom archive'))
      child.stderr.end(Buffer.from(PASSWORD))
      setImmediate(() => child.emit('close', 0, null))
    })
    return child
  }

  const environment = {
    PATH: 'C:\\fake\\postgres\\bin', SystemRoot: 'C:\\Windows',
    PGHOST: 'stale-host', PGPORT: '1', PGDATABASE: 'stale-db', PGUSER: 'stale-user',
    PGSERVICE: 'stale-service', PGSERVICEFILE: 'C:\\private\\service.conf', PGOPTIONS: '-c search_path=public',
    PGTARGETSESSIONATTRS: 'read-write', PGSSLMODE: 'verify-full', PGPASSFILE: 'C:\\private\\pgpass',
    PGPASSWORD: PASSWORD,
    JENFU_LOCAL_SANDBOX_PLATFORM_KEY: 'platform-client-secret-must-not-reach-pg_dump',
  }
  const owner = createDev126LocalPostgresSnapshotOwner({ Pool, spawn, environment })
  return { input, owner, events, queries, pools, spawns, environment }
}

test('captures only ai_pdm_core through the migrator owner on one exported snapshot', async () => {
  const harness = makeHarness()
  const snapshot = await harness.owner.captureAiPdmCoreSnapshot(harness.input)

  assert.equal(snapshot.connection.currentUser, OWNER)
  assert.equal(snapshot.connection.sessionUser, OWNER)
  assert.equal(snapshot.targetMetadata.generation, GENERATION)
  assert.equal(snapshot.schemaOwner, OWNER)
  assert.equal(snapshot.principalSessionCount, 0)
  assert.equal(snapshot.principalBindingCount, 0)
  assert.deepEqual(snapshot.dataDump.includedRelations, ['companies', 'file_assets', 'parts'])
  assert.equal(snapshot.dataDump.format, 'custom-data-only')
  assert.deepEqual(snapshot.storagePointers, [{
    sourceTable: 'file_assets', sourceId: 'asset-1', provider: 'local_repository',
    key: 'assets/sample.pdf', sha256: 'b'.repeat(64), bytes: 17,
  }])

  assert.equal(harness.pools.length, 1)
  assert.equal(harness.pools[0].user, OWNER)
  assert.equal(harness.pools[0].database, DATABASE)
  assert.equal(harness.pools[0].host, '127.0.0.1')
  assert.equal(harness.pools[0].port, 15432)
  assert.equal(harness.pools[0].password, undefined)
  assert.equal(harness.pools[0].connectionString, undefined)
  assert.ok(harness.events.indexOf('spawn') < harness.events.indexOf('COMMIT'))
  assert.ok(harness.events.includes('release'))
  assert.ok(harness.events.includes('pool-end'))
  assert.ok(harness.queries.some(({ sql }) => sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')))
  assert.ok(harness.queries.some(({ sql }) => sql.includes('pg_export_snapshot')))
  assert.ok(harness.queries.every(({ sql }) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/iu.test(sql)))
  assert.ok(harness.queries.every(({ sql }) => !sql.includes('ai_pdm_contract') && !sql.includes('public.')))

  assert.equal(harness.spawns.length, 1)
  const [dump] = harness.spawns
  assert.equal(dump.executable, DEV126_LOCAL_POSTGRES_SNAPSHOT_OWNER_POLICY.dumpExecutable)
  assert.deepEqual(dump.args, [
    '--no-password', '--host', '127.0.0.1', '--port', '15432', '--dbname', DATABASE,
    '--format=custom', '--data-only', '--no-owner', '--no-privileges', '--schema=ai_pdm_core',
    '--snapshot=00000003-00000001-1', '--lock-wait-timeout=5000',
    ...CONTROL.map((name) => `--exclude-table-data=ai_pdm_core.${name}`),
  ])
  assert.equal(dump.options.shell, false)
  assert.equal(dump.options.windowsHide, true)
  assert.equal(dump.options.env.PGUSER, OWNER)
  assert.equal(dump.options.env.PGHOST, '127.0.0.1')
  assert.equal(dump.options.env.PGPORT, '15432')
  assert.equal(dump.options.env.PGDATABASE, DATABASE)
  assert.equal(dump.options.env.PGPASSWORD, PASSWORD)
  assert.equal(dump.options.env.PGPASSFILE, 'C:\\private\\pgpass')
  assert.equal(dump.options.env.PATH, 'C:\\fake\\postgres\\bin')
  assert.equal(dump.options.env.SYSTEMROOT, 'C:\\Windows')
  assert.equal(dump.options.env.JENFU_LOCAL_SANDBOX_PLATFORM_KEY, undefined)
  assert.equal(dump.options.env.PGSERVICE, undefined)
  assert.equal(dump.options.env.PGSERVICEFILE, undefined)
  assert.equal(dump.options.env.PGOPTIONS, undefined)
  assert.equal(dump.options.env.PGTARGETSESSIONATTRS, undefined)
  assert.ok(!dump.args.join('\0').includes(PASSWORD))
})

test('rejects runtime-owner conflation and absent owner credentials before opening a pool', async () => {
  const roleCollision = makeHarness({ inputOverrides: {
    expectedDatabase: { ...makeInput().expectedDatabase, runtimeRole: OWNER },
    runtimeTargetObservation: {
      ...makeInput().runtimeTargetObservation,
      connection: { ...makeInput().runtimeTargetObservation.connection, currentUser: OWNER, sessionUser: OWNER },
    },
  } })
  await assert.rejects(roleCollision.owner.captureAiPdmCoreSnapshot(roleCollision.input),
    { code: 'local_reset_owner_target_invalid' })
  assert.equal(roleCollision.pools.length, 0)

  const noCredentials = makeHarness()
  noCredentials.environment.PGPASSWORD = ''
  noCredentials.environment.PGPASSFILE = ''
  const noCredentialOwner = createDev126LocalPostgresSnapshotOwner({
    Pool: function () { assert.fail('pool must not open without owner credentials') },
    spawn: () => assert.fail('dump must not start without owner credentials'),
    environment: noCredentials.environment,
  })
  await assert.rejects(noCredentialOwner.captureAiPdmCoreSnapshot(noCredentials.input),
    { code: 'local_reset_owner_credentials_unavailable' })
})

test('rejects incorrect offline owner connection provenance before pg_dump', async () => {
  const harness = makeHarness({ connection: {
    database_name: DATABASE, current_user: OWNER, session_user: 'unexpected_login',
    server_address: '127.0.0.1', server_port: 15432,
  } })
  await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input),
    { code: 'local_reset_owner_connection_mismatch' })
  assert.equal(harness.spawns.length, 0)
  assert.ok(harness.events.includes('ROLLBACK'))
})

test('requires an empty principal registry and complete owned-table inventory before dump', async (t) => {
  await t.test('nonempty session registry', async () => {
    const harness = makeHarness({ principalSessionCount: 1 })
    await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input),
      { code: 'local_reset_owner_registry_not_empty' })
    assert.equal(harness.spawns.length, 0)
    assert.equal(harness.queries.some(({ sql }) => sql.includes('FROM pg_catalog.pg_class')), false)
  })
  await t.test('missing required control relation', async () => {
    const harness = makeHarness({ missingRelation: CONTROL[0] })
    await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input),
      { code: 'local_reset_owner_relation_invalid' })
    assert.equal(harness.spawns.length, 0)
  })
  await t.test('foreign table in schema', async () => {
    const harness = makeHarness({ foreignTable: 'parts' })
    await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input),
      { code: 'local_reset_owner_relation_invalid' })
    assert.equal(harness.spawns.length, 0)
  })
})

test('rejects owner, target, schema, and storage drift before pg_dump', async (t) => {
  const cases = [
    ['schema owner mismatch', { schemaOwner: 'other_owner' }, 'local_reset_owner_schema_mismatch'],
    ['relation owner mismatch', { relationOwner: 'other_owner' }, 'local_reset_owner_relation_invalid'],
    ['generation mismatch', { targetRow: { generation: '00000000-0000-4000-8000-000000000127' } },
      'local_reset_owner_target_mismatch'],
    ['nonlocal storage', { pointerRows: (table) => table === 'file_assets' ? [{
      source_id: 'asset-1', provider: 'google_cloud_storage', key: 'bucket/key', legacy_path: null,
      sha256: null, bytes: null,
    }] : [] }, 'local_reset_owner_external_storage'],
  ]
  for (const [label, overrides, code] of cases) {
    await t.test(label, async () => {
      const harness = makeHarness(overrides)
      await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input), { code })
      assert.equal(harness.spawns.length, 0)
    })
  }
})

test('rejects malformed scope before opening a pool', async () => {
  const harness = makeHarness({ inputOverrides: { scope: { ...makeInput().scope, excludedTableData: null } } })
  await assert.rejects(harness.owner.captureAiPdmCoreSnapshot(harness.input),
    { code: 'local_reset_owner_scope_invalid' })
  assert.equal(harness.pools.length, 0)
})
