import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildLocalDev090MigrationSource,
  createLedger,
  createLegacyStage,
  executeMigration,
  preparePdmLegacyLedger,
  seedPdmBaselineCatalog,
  verifyNoSessions,
} from './dev126-local-native-bootstrap-owner.mjs'

const MIGRATOR = 'jenfu_ai_pdm_migrator'
const REVISION = 'a'.repeat(40)
const hash = value => createHash('sha256').update(value).digest('hex')
const key = (schema, table) => `${schema}.${table}`
const DEV090_SQL = readFileSync(new URL('../../db/postgres/043_inline_relation_matrix.sql', import.meta.url))

function nativeLedgerRelation() {
  return relation('ai_pdm_core', 'schema_migrations', [
    ['version', 'text', true, null], ['name', 'text', true, null], ['checksum_sha256', 'character(64)', true, null],
    ['source_revision', 'text', true, null], ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ], [
    { contype: 'p', definition: 'PRIMARY KEY (version)' },
    { contype: 'c', definition: "CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text))" },
  ])
}

function legacyLedgerRelation() {
  return relation('ai_pdm_legacy_stage', 'pdm_schema_migrations', [
    ['version', 'text', true, null], ['name', 'text', true, null], ['checksum', 'character(64)', true, null],
    ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ], [{ contype: 'p', definition: 'PRIMARY KEY (version)' }])
}

function localReceiptRelation() {
  return relation('ai_pdm_core', 'local_native_bootstrap_receipts', [
    ['path', 'text', true, null], ['source_sha256', 'character(64)', true, null],
    ['applied_sha256', 'character(64)', true, null], ['source_revision', 'text', true, null],
    ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ], [
    { contype: 'p', definition: 'PRIMARY KEY (path)' },
    { contype: 'c', definition: "CHECK ((source_sha256 ~ '^[a-f0-9]{64}$'::text))" },
    { contype: 'c', definition: "CHECK ((applied_sha256 ~ '^[a-f0-9]{64}$'::text))" },
    { contype: 'c', definition: "CHECK ((source_revision ~ '^[a-f0-9]{40}$'::text))" },
  ])
}

function relation(schema, name, columns, constraints = []) {
  return { schema, name, owner: MIGRATOR, relkind: 'r', columns: columns.map(([column_name, data_type, not_null, default_expr]) =>
    ({ column_name, data_type, not_null, default_expr })), constraints, forbiddenAcl: false }
}

function makeClient(options = {}) {
  let state = {
    databaseName: 'jenfu_local_dev126_fixture', address: '127.0.0.1', currentRole: 'bootstrap_owner',
    searchPath: '$user, public',
    schemas: new Map([['ai_pdm_core', MIGRATOR], ...(options.legacySchema ? [['ai_pdm_legacy_stage', MIGRATOR]] : [])]),
    relations: new Map(), ledger: new Map(options.ledger ?? []), legacyRows: structuredClone(options.legacyRows ?? []),
    receipts: new Map(options.receipts ?? []), publications: structuredClone(options.publications ?? []),
    catalogRoles: structuredClone(options.catalogRoles ?? []), activeCatalog: structuredClone(options.activeCatalog ?? []),
    sessionCount: options.sessionCount ?? null,
  }
  if (options.nativeLedger !== false) state.relations.set(key('ai_pdm_core', 'schema_migrations'), nativeLedgerRelation())
  if (options.legacyTable) state.relations.set(key('ai_pdm_legacy_stage', 'pdm_schema_migrations'), legacyLedgerRelation())
  if (options.localReceiptTable) state.relations.set(key('ai_pdm_core', 'local_native_bootstrap_receipts'), localReceiptRelation())
  let transactionSnapshot = null
  const events = []
  const executedSql = []
  const clone = value => structuredClone(value)

  async function query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/gu, ' ').trim()
    events.push({ sql: normalized, values: clone(values) })
    if (normalized.startsWith('SELECT current_database()')) return { rows: [{ database_name: state.databaseName, address: state.address }] }
    if (normalized === 'BEGIN') { transactionSnapshot = clone(state); return { rows: [] } }
    if (normalized === 'COMMIT') { transactionSnapshot = null; return { rows: [] } }
    if (normalized === 'ROLLBACK') { if (transactionSnapshot) state = transactionSnapshot; transactionSnapshot = null; return { rows: [] } }
    if (normalized.startsWith('SET LOCAL ROLE ')) { state.currentRole = MIGRATOR; return { rows: [] } }
    if (normalized.startsWith('SET LOCAL search_path TO ')) {
      state.searchPath = normalized.slice('SET LOCAL search_path TO '.length)
      return { rows: [] }
    }
    if (normalized === 'RESET ROLE') { state.currentRole = 'bootstrap_owner'; return { rows: [] } }
    if (normalized === 'SELECT current_user AS role_name') return { rows: [{ role_name: state.currentRole }] }
    if (normalized.startsWith('SELECT current_user AS role_name, current_schema() AS schema_name')) {
      return { rows: [{ role_name: state.currentRole,
        schema_name: state.searchPath.startsWith('ai_pdm_core') ? 'ai_pdm_core' : 'public',
        search_path: state.searchPath }] }
    }
    if (normalized.includes('FROM pg_catalog.pg_namespace WHERE nspname=$1')) {
      const owner = state.schemas.get(values[0])
      return { rows: owner ? [{ nspname: values[0], schema_owner: owner }] : [] }
    }
    if (normalized.includes('SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname=$1')) {
      return { rows: state.schemas.has(values[0]) ? [{ nspname: values[0] }] : [] }
    }
    if (normalized.includes('pg_catalog.aclexplode')) {
      const item = state.relations.get(key(values[0], values[1]))
      return { rows: [{ forbidden_acl: item?.forbiddenAcl ?? false }] }
    }
    if (normalized.includes('FROM pg_catalog.pg_class c') && normalized.includes('c.relname=$2')) {
      const item = state.relations.get(key(values[0], values[1]))
      return { rows: item ? [{ relkind: item.relkind, relation_owner: item.owner }] : [] }
    }
    if (normalized.includes('FROM pg_catalog.pg_attribute a')) {
      return { rows: state.relations.get(key(values[0], values[1]))?.columns ?? [] }
    }
    if (normalized.includes('FROM pg_catalog.pg_constraint con')) {
      return { rows: state.relations.get(key(values[0], values[1]))?.constraints ?? [] }
    }
    if (normalized.includes('FROM ai_pdm_core.schema_migrations WHERE version=$1')) {
      const entry = state.ledger.get(values[0])
      return { rows: entry ? [clone(entry)] : [] }
    }
    if (normalized.includes('FROM ai_pdm_legacy_stage.pdm_schema_migrations ORDER BY version')) {
      return { rows: clone(state.legacyRows).sort((a, b) => a.version.localeCompare(b.version)) }
    }
    if (normalized.includes('FROM ai_pdm_core.local_native_bootstrap_receipts WHERE path=$1')) {
      const entry = state.receipts.get(values[0])
      return { rows: entry ? [clone(entry)] : [] }
    }
    if (normalized.includes('FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=$1')) {
      return { rows: clone(state.publications.filter(row => row.catalog_version === values[0])) }
    }
    if (normalized.includes('FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1')) {
      return { rows: clone(state.catalogRoles.filter(row => row.catalog_version === values[0])) }
    }
    if (normalized.includes('FROM ai_pdm_core.active_role_catalog WHERE application_id=\'ai-pdm\'')) {
      return { rows: clone(state.activeCatalog) }
    }
    if (normalized.includes("c.relname='principal_session_records'")) {
      return { rows: state.sessionCount === null ? [] : [{ relkind: 'r' }] }
    }
    if (normalized.startsWith('SELECT count(*)::text AS session_count')) {
      return { rows: [{ session_count: String(state.sessionCount) }] }
    }
    if (normalized.startsWith('CREATE TABLE IF NOT EXISTS ai_pdm_core.schema_migrations')) {
      if (!state.relations.has(key('ai_pdm_core', 'schema_migrations'))) state.relations.set(key('ai_pdm_core', 'schema_migrations'), nativeLedgerRelation())
      return { rows: [] }
    }
    if (normalized.startsWith('CREATE SCHEMA IF NOT EXISTS ai_pdm_legacy_stage')) {
      if (!state.schemas.has('ai_pdm_legacy_stage')) state.schemas.set('ai_pdm_legacy_stage', MIGRATOR)
      return { rows: [] }
    }
    if (normalized.startsWith('CREATE TABLE IF NOT EXISTS ai_pdm_legacy_stage.pdm_schema_migrations')) {
      if (!state.relations.has(key('ai_pdm_legacy_stage', 'pdm_schema_migrations'))) {
        state.relations.set(key('ai_pdm_legacy_stage', 'pdm_schema_migrations'), legacyLedgerRelation())
        state.legacyRows = []
      }
      return { rows: [] }
    }
    if (normalized.startsWith('CREATE TABLE IF NOT EXISTS ai_pdm_core.local_native_bootstrap_receipts')) {
      if (!state.relations.has(key('ai_pdm_core', 'local_native_bootstrap_receipts'))) {
        state.relations.set(key('ai_pdm_core', 'local_native_bootstrap_receipts'), localReceiptRelation())
      }
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.schema_migrations')) {
      state.ledger.set(values[0], { version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_legacy_stage.pdm_schema_migrations')) {
      state.legacyRows.push({ version: values[0], name: values[1], checksum: values[2] })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.local_native_bootstrap_receipts')) {
      state.receipts.set(values[0], { path: values[0], source_sha256: values[1], applied_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.role_catalog_publications')) {
      state.publications.push({ catalog_version: values[0], contract_version: values[1], application_id: values[2],
        published_at: values[3], catalog_sha256: values[4], status: 'active', published_by: values[5], retired_at: null })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.role_catalog_entries')) {
      state.catalogRoles.push({ catalog_version: values[0], display_order: values[1], stable_role_id: values[2],
        role_code: values[3], display_name: values[4], assignable: values[5], risk: values[6], subject_kind: values[7],
        recommendation_allowed: values[8], delegation_allowed: values[9], allowed_scope_kinds: JSON.parse(values[10]),
        assignment_tier: values[11], permissions: JSON.parse(values[12]), metadata: JSON.parse(values[13]), role_definition_hash: values[14] })
      return { rows: [] }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.active_role_catalog')) {
      state.activeCatalog = [{ application_id: 'ai-pdm', catalog_version: values[0], activated_at: new Date(),
        activated_by: values[1], activation_reason: values[2] }]
      return { rows: [] }
    }
    if (normalized.startsWith('REVOKE ALL ON TABLE')) return { rows: [] }
    if (normalized === 'SELECT to_regclass(\'ai_pdm_core.local_sandbox_principal_session_bindings\') IS NOT NULL AS ready') {
      return { rows: [{ ready: true }] }
    }
    if (sql === 'FAIL MIGRATION') { const error = new Error('fixture migration failure'); error.code = '23514'; throw error }
    if (sql === 'FAIL BEFORE') { const error = new Error('fixture before failure'); error.code = '23514'; throw error }
    if (typeof sql === 'string' && sql.startsWith('SELECT') && sql.includes('current_user')) return { rows: [{ role_name: state.currentRole }] }
    executedSql.push(sql)
    return { rows: [] }
  }
  return { query, state: () => state, events, executedSql }
}

function migration(overrides = {}) {
  const sql = overrides.sql ?? 'SELECT 1 /* local fixture migration */'
  return {
    owner: 'ai-pdm', version: '091', name: 'dev126_local_principal_sandbox',
    path: 'db/postgres/091_dev126_local_principal_sandbox.sql', sourceSha256: hash('source bytes'),
    appliedSha256: hash(sql), sql, ...overrides,
  }
}

function ledgerRow(entry, sourceRevision = REVISION, checksum = entry.appliedSha256) {
  return [entry.version, { version: entry.version, name: entry.name, checksum_sha256: checksum, source_revision: sourceRevision }]
}

async function asMigrator(client, work) {
  await client.query('BEGIN')
  await client.query(`SET LOCAL ROLE ${MIGRATOR}`)
  try {
    const result = await work()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

const legacyLedger = [
  { version: '001', name: 'historical_one', checksum: '1'.repeat(64) },
  { version: '002', name: 'historical_two', checksum: '2'.repeat(64) },
]

function catalog() {
  return {
    applicationId: 'ai-pdm', contractVersion: 'jenfu.platform-entitlement.v1',
    catalogVersion: 'ai-pdm.role-catalog.2026-09-03.v3', publishedAt: '2026-10-01T00:00:00.000Z',
    catalogSha256: 'c'.repeat(64),
    roles: Array.from({ length: 9 }, (_, index) => ({
      stableRoleId: `role-${index + 1}`, roleCode: `role_${index + 1}`, displayName: `Role ${index + 1}`,
      assignable: true, risk: 'normal', subjectKind: 'employee', recommendationAllowed: true,
      delegationAllowed: true, allowedScopeKinds: ['workspace'], assignmentTier: 'app_admin',
      permissions: [{ code: `permission.${index + 1}`, kind: 'action', allowed: true }],
      metadata: index === 0 ? { requiresReview: true } : undefined, roleDefinitionHash: String(index + 1).padStart(64, '0'),
    })),
  }
}

test('createLedger and createLegacyStage are idempotent and verify migrator ownership', async () => {
  const client = makeClient({ nativeLedger: false })
  const audit = { bootstrapObjects: [] }
  assert.deepEqual(await createLedger(client, REVISION, audit), { reused: false })
  assert.deepEqual(await createLedger(client, REVISION, audit), { reused: true })
  assert.equal(audit.bootstrapObjects.length, 1)

  assert.deepEqual(await createLegacyStage(client), { reused: false })
  assert.deepEqual(await createLegacyStage(client), { reused: true })
  assert.equal(client.state().schemas.get('ai_pdm_legacy_stage'), MIGRATOR)
})

test('PostgreSQL 18 NOT NULL catalog rows do not duplicate the separately verified column nullability', async () => {
  const client = makeClient()
  const ledger = client.state().relations.get(key('ai_pdm_core', 'schema_migrations'))
  for (const column of ['version','name','checksum_sha256','source_revision','applied_at']) {
    ledger.constraints.push({ contype: 'n', definition: 'NOT NULL ' + column })
  }
  assert.deepEqual(await createLedger(client, REVISION, { bootstrapObjects: [] }), { reused: true })
})

test('createLedger rejects a pre-existing relation owned by another role', async () => {
  const client = makeClient()
  client.state().relations.get(key('ai_pdm_core', 'schema_migrations')).owner = 'bootstrap_owner'
  await assert.rejects(createLedger(client, REVISION, { bootstrapObjects: [] }), /LOCAL_NATIVE_AI_PDM_RELATION_OWNER_OR_KIND_MISMATCH/u)
  assert.ok(client.events.some(event => event.sql === 'ROLLBACK'))
})

test('executeMigration reuses an exact native receipt without running DDL or before callback', async () => {
  const entry = migration({ version: '062', name: 'dev010_neutral_schema_boundary', sql: 'SELECT 62' })
  const client = makeClient({ ledger: [ledgerRow(entry)] })
  let beforeCalls = 0
  assert.deepEqual(await executeMigration(client, entry, REVISION, { before: async () => { beforeCalls++ } }), { reused: true })
  assert.equal(beforeCalls, 0)
  assert.equal(client.executedSql.length, 0)
  assert.ok(client.events.some(event => event.sql === 'COMMIT'))
})

test('executeMigration rejects a conflicting native receipt before DDL and rolls back', async () => {
  const entry = migration({ version: '062', name: 'dev010_neutral_schema_boundary', sql: 'SELECT 62' })
  const correct = ledgerRow(entry)[1]
  const mismatches = [
    { ...correct, name: 'different_migration' },
    { ...correct, checksum_sha256: 'f'.repeat(64) },
    { ...correct, source_revision: 'b'.repeat(40) },
  ]
  for (const receipt of mismatches) {
    const client = makeClient({ ledger: [[entry.version, receipt]] })
    let beforeCalls = 0
    await assert.rejects(executeMigration(client, entry, REVISION, { before: async () => { beforeCalls++ } }),
      /LOCAL_NATIVE_AI_PDM_LEDGER_RECEIPT_MISMATCH/u)
    assert.equal(beforeCalls, 0)
    assert.equal(client.executedSql.length, 0)
    assert.ok(client.events.some(event => event.sql === 'ROLLBACK'))
  }
})

test('executeMigration commits migration SQL and the native receipt together, rolling both back on SQL failure', async () => {
  const entry = migration({ version: '063', name: 'local_fixture', sql: 'SELECT 63' })
  const client = makeClient()
  const order = []
  assert.deepEqual(await executeMigration(client, entry, REVISION, { before: async () => { order.push('before') } }), { reused: false })
  assert.deepEqual(order, ['before'])
  assert.deepEqual(client.executedSql, ['SELECT 63'])
  assert.deepEqual(client.state().ledger.get('063'), ledgerRow(entry)[1])

  const failed = makeClient()
  const broken = migration({ version: '064', name: 'local_fixture_failure', sql: 'FAIL MIGRATION' })
  await assert.rejects(executeMigration(failed, broken, REVISION), /LOCAL_NATIVE_AI_PDM_MIGRATION_FAILED/u)
  assert.equal(failed.state().ledger.has('064'), false)
  assert.ok(failed.events.some(event => event.sql === 'ROLLBACK'))
})

test('a historical SQL role reset is followed by an owner context before its atomic receipt write', async () => {
  const client = makeClient()
  const entry = migration({ version: '062-role-restore', name: 'neutral_role_reset', sql: 'RESET ROLE' })
  assert.deepEqual(await executeMigration(client, entry, REVISION), { reused: false })
})

test('localOnly migrations use path-bound local receipts and never enter schema_migrations', async () => {
  const entry = migration({ localOnly: true, sql: 'SELECT 91' })
  const client = makeClient()
  let beforeCalls = 0
  assert.deepEqual(await executeMigration(client, entry, REVISION, { ledgerEntries: [], before: async () => { beforeCalls++ } }), { reused: false })
  assert.deepEqual(await executeMigration(client, entry, REVISION, { ledgerEntries: [], before: async () => { beforeCalls++ } }), { reused: true })
  assert.equal(beforeCalls, 1)
  assert.equal(client.state().ledger.has('091'), false)
  assert.equal(client.state().receipts.get(entry.path).source_sha256, entry.sourceSha256)
  assert.equal(client.executedSql.filter(sql => sql === entry.sql).length, 1)
})

test('builds and executes the pinned local-only DEV-090 043 source under migrator-owned search_path', async () => {
  const source = buildLocalDev090MigrationSource(DEV090_SQL, REVISION)
  assert.deepEqual({ ...source.entry, sql: undefined }, {
    owner: 'ai-pdm', version: 'local-ai-pdm-043', name: 'dev090_inline_relation_matrix',
    path: 'db/postgres/043_inline_relation_matrix.sql',
    sourceSha256: '9fffda2c684be440115a0a3e83fcd4f57248340f12077971fd210c9f9cac634e',
    appliedSha256: '9fffda2c684be440115a0a3e83fcd4f57248340f12077971fd210c9f9cac634e',
    sql: undefined, localOnly: true,
  })
  assert.equal(source.sourceRevision, REVISION)

  const client = makeClient({ localReceiptTable: true })
  assert.deepEqual(await executeMigration(client, source.entry, source.sourceRevision, {
    ledgerEntries: [], before: source.before,
  }), { reused: false })
  const roleIndex = client.events.findIndex(event => event.sql === `SET LOCAL ROLE ${MIGRATOR}`)
  const searchPathIndex = client.events.findIndex(event => event.sql === 'SET LOCAL search_path TO ai_pdm_core, pg_catalog')
  const migrationIndex = client.executedSql.findIndex(sql => sql === source.entry.sql)
  assert.ok(roleIndex >= 0 && searchPathIndex > roleIndex && migrationIndex >= 0)
  assert.equal(client.state().searchPath, 'ai_pdm_core, pg_catalog')
  assert.equal(client.state().ledger.has('local-ai-pdm-043'), false)
  assert.equal(client.state().receipts.get(source.entry.path).source_sha256, source.entry.sourceSha256)
  assert.equal(client.state().receipts.get(source.entry.path).applied_sha256, source.entry.appliedSha256)

  await assert.rejects(source.before({ query: async sql => sql.startsWith('SET LOCAL search_path')
    ? { rows: [] }
    : { rows: [{ role_name: 'bootstrap_owner', schema_name: 'public', search_path: '$user, public' }] } }),
  { code: 'LOCAL_NATIVE_AI_PDM_DEV090_TARGET_CONTEXT_MISMATCH' })

  const changed = Buffer.from(DEV090_SQL)
  changed[0] ^= 1
  assert.throws(() => buildLocalDev090MigrationSource(changed, REVISION), /DEV090_SOURCE_HASH_MISMATCH/u)
  assert.throws(() => buildLocalDev090MigrationSource(DEV090_SQL, 'invalid-revision'), /DEV090_SOURCE_INVALID/u)
})

test('localOnly conflicts and failed DDL fail closed without leaving a receipt', async () => {
  const entry = migration({ localOnly: true, sql: 'SELECT 91' })
  const mismatch = makeClient({ localReceiptTable: true, receipts: [[entry.path, {
    path: entry.path, source_sha256: 'f'.repeat(64), applied_sha256: entry.appliedSha256, source_revision: REVISION,
  }]] })
  await assert.rejects(executeMigration(mismatch, entry, REVISION, { ledgerEntries: [] }), /LOCAL_NATIVE_AI_PDM_LOCAL_RECEIPT_MISMATCH/u)
  assert.equal(mismatch.executedSql.length, 0)

  const failed = makeClient()
  const broken = migration({ localOnly: true, sql: 'FAIL MIGRATION' })
  await assert.rejects(executeMigration(failed, broken, REVISION, { ledgerEntries: [] }), /LOCAL_NATIVE_AI_PDM_MIGRATION_FAILED/u)
  assert.equal(failed.state().receipts.size, 0)
  assert.equal(failed.state().relations.has(key('ai_pdm_core', 'local_native_bootstrap_receipts')), false)
})

test('localOnly refuses runtime-readable receipt tables and native-ledger collisions', async () => {
  const entry = migration({ localOnly: true, sql: 'SELECT 91' })
  const exposed = makeClient({ localReceiptTable: true })
  exposed.state().relations.get(key('ai_pdm_core', 'local_native_bootstrap_receipts')).forbiddenAcl = true
  await assert.rejects(executeMigration(exposed, entry, REVISION, { ledgerEntries: [] }),
    /LOCAL_NATIVE_AI_PDM_LOCAL_RECEIPT_ACL_INVALID/u)
  assert.equal(exposed.executedSql.length, 0)

  const collision = makeClient({ ledger: [ledgerRow(entry)] })
  await assert.rejects(executeMigration(collision, entry, REVISION, { ledgerEntries: [] }),
    /LOCAL_NATIVE_AI_PDM_LOCAL_ONLY_NATIVE_LEDGER_COLLISION/u)
  assert.equal(collision.executedSql.length, 0)
})

test('legacy ledger staging reuses only the exact historical row set and never records 062', async () => {
  const client = makeClient({ legacySchema: true })
  assert.deepEqual(await asMigrator(client, () => preparePdmLegacyLedger(client, legacyLedger)), { reused: false })
  assert.deepEqual(await asMigrator(client, () => preparePdmLegacyLedger(client, legacyLedger)), { reused: true })
  assert.equal(client.state().ledger.has('062'), false)

  const conflict = makeClient({ legacySchema: true, legacyTable: true, legacyRows: [
    { version: '001', name: 'historical_one', checksum: 'f'.repeat(64) },
  ] })
  await assert.rejects(asMigrator(conflict, () => preparePdmLegacyLedger(conflict, legacyLedger)), /LOCAL_NATIVE_AI_PDM_LEGACY_LEDGER_MISMATCH/u)
  assert.equal(conflict.state().legacyRows.length, 1)

  const applied = makeClient({ legacySchema: true, ledger: [['062', { version: '062', name: 'already_applied',
    checksum_sha256: 'a'.repeat(64), source_revision: REVISION }]] })
  await assert.rejects(asMigrator(applied, () => preparePdmLegacyLedger(applied, legacyLedger)), /LOCAL_NATIVE_AI_PDM_LEGACY_LEDGER_AFTER_062/u)
})

test('v3 catalog bootstrap seeds an empty baseline, reuses exact state, and rejects drift or an applied 066 receipt', async () => {
  const value = catalog()
  const client = makeClient()
  assert.deepEqual(await asMigrator(client, () => seedPdmBaselineCatalog(client, value)), { reused: false })
  const insertsAfterSeed = client.events.filter(event => event.sql.startsWith('INSERT INTO ai_pdm_core.')).length
  assert.deepEqual(await asMigrator(client, () => seedPdmBaselineCatalog(client, value)), { reused: true })
  assert.equal(client.events.filter(event => event.sql.startsWith('INSERT INTO ai_pdm_core.')).length, insertsAfterSeed)

  const drift = makeClient({ publications: [{ catalog_version: value.catalogVersion, status: 'retired' }] })
  await assert.rejects(asMigrator(drift, () => seedPdmBaselineCatalog(drift, value)), /LOCAL_NATIVE_AI_PDM_CATALOG_STATE_MISMATCH/u)
  assert.equal(drift.events.some(event => event.sql.startsWith('INSERT INTO ai_pdm_core.role_catalog_')), false)

  const applied = makeClient({ ledger: [['066', { version: '066', name: 'role_catalog_v4',
    checksum_sha256: 'b'.repeat(64), source_revision: REVISION }]] })
  await assert.rejects(asMigrator(applied, () => seedPdmBaselineCatalog(applied, value)), /LOCAL_NATIVE_AI_PDM_CATALOG_SEED_AFTER_066/u)
})

test('verifyNoSessions treats missing native ledger as empty phase and reads only PDM native records when present', async () => {
  assert.equal(await verifyNoSessions(makeClient()), true)
  assert.equal(await verifyNoSessions(makeClient({ sessionCount: 0 })), true)
  const populated = makeClient({ sessionCount: 2 })
  assert.equal(await verifyNoSessions(populated), false)
  assert.ok(populated.events.some(event => event.sql.includes('ai_pdm_core.principal_session_records')))
  assert.equal(populated.events.some(event => /(?:orgmaster|platform)_core/iu.test(event.sql)), false)
})
