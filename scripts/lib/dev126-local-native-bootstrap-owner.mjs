import { createHash } from 'node:crypto'

// Owner-scoped local bootstrap. Called only by the admitted disposable-cluster
// coordinator; no runtime/HTTP route imports this module.
const OWNER = 'ai-pdm'
const MIGRATOR = 'jenfu_ai_pdm_migrator'
const RUNTIME_ROLES = ['jenfu_ai_pdm_runtime']
const HASH = /^[a-f0-9]{64}$/u
const HASH40 = /^[a-f0-9]{40}$/u
const DEV090_MIGRATION_043 = Object.freeze({
  version: 'local-ai-pdm-043',
  name: 'dev090_inline_relation_matrix',
  path: 'db/postgres/043_inline_relation_matrix.sql',
  sha256: '9fffda2c684be440115a0a3e83fcd4f57248340f12077971fd210c9f9cac634e',
})
const V3_CATALOG_VERSION = 'ai-pdm.role-catalog.2026-09-03.v3'
const PDM_SCHEMA = 'ai_pdm_core'
const LEGACY_SCHEMA = 'ai_pdm_legacy_stage'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => Object.assign(new Error('LOCAL_NATIVE_AI_PDM_' + code), { code: 'LOCAL_NATIVE_AI_PDM_' + code })

async function rows(client, sql, values) {
  const result = await client.query(sql, values)
  if (!result || !Array.isArray(result.rows)) throw fail('READBACK_INVALID')
  return result.rows
}

async function guardTarget(client) {
  const result = await client.query("SELECT current_database() AS database_name, host(inet_server_addr()) AS address")
  const row = result.rows?.[0]
  if (result.rows?.length !== 1 || !row || !/^jenfu_local_[a-z0-9_]{3,51}$/u.test(row.database_name ?? '') ||
    !['127.0.0.1', '::1'].includes(row.address)) throw fail('TARGET_INVALID')
}

async function transact(client, work) {
  await guardTarget(client)
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE ' + MIGRATOR)
    const result = await work()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

function validMigrationEntry(entry, sourceRevision) {
  if (!entry || typeof entry !== 'object' || entry.owner !== OWNER ||
    typeof entry.version !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(entry.version) ||
    typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u.test(entry.name) ||
    typeof entry.sql !== 'string' || !HASH.test(entry.appliedSha256 ?? '') ||
    sha256(Buffer.from(entry.sql, 'utf8')) !== entry.appliedSha256 || !HASH40.test(sourceRevision ?? '')) {
    throw fail('SOURCE_INVALID')
  }
}

function validLedgerEntry(entry) {
  return Boolean(entry && typeof entry === 'object' && entry.owner === OWNER &&
    typeof entry.version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(entry.version) &&
    typeof entry.name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u.test(entry.name) &&
    HASH.test(entry.appliedSha256 ?? ''))
}

async function assertMigratorRole(client) {
  const result = await rows(client, 'SELECT current_user AS role_name')
  if (result.length !== 1 || result[0].role_name !== MIGRATOR) throw fail('OWNER_ROLE_REQUIRED')
}

async function assertSchemaOwner(client, schemaName) {
  const result = await rows(client, `
    SELECT nspname, pg_catalog.pg_get_userbyid(nspowner) AS schema_owner
    FROM pg_catalog.pg_namespace WHERE nspname=$1
  `, [schemaName])
  if (result.length !== 1 || result[0].nspname !== schemaName || result[0].schema_owner !== MIGRATOR) {
    throw fail('SCHEMA_OWNER_MISMATCH')
  }
}

async function relationInfo(client, schemaName, tableName) {
  return rows(client, `
    SELECT c.relkind, pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=$2
  `, [schemaName, tableName])
}

async function assertRelationShape(client, schemaName, tableName, expected) {
  await assertSchemaOwner(client, schemaName)
  const relation = await relationInfo(client, schemaName, tableName)
  if (relation.length !== 1 || relation[0].relkind !== 'r' || relation[0].relation_owner !== MIGRATOR) {
    throw fail('RELATION_OWNER_OR_KIND_MISMATCH')
  }
  const columns = await rows(client, `
    SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
           a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [schemaName, tableName])
  const observedColumns = columns.map(column => [column.column_name, column.data_type,
    column.not_null === true, column.default_expr ?? null])
  if (JSON.stringify(observedColumns) !== JSON.stringify(expected.columns)) throw fail('LEDGER_SHAPE_MISMATCH')
  const constraints = await rows(client, `
    SELECT con.contype, pg_catalog.pg_get_constraintdef(con.oid) AS definition
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=$2
    ORDER BY con.contype, con.conname
  `, [schemaName, tableName])
  // PostgreSQL 18 also publishes NOT NULL as contype=n. attnotnull above
  // already proves those constraints for every exact column; preserve checks
  // for all other constraint kinds instead of double-counting NOT NULL.
  if (!expected.constraints(constraints.filter(row => row.contype !== 'n'))) throw fail('LEDGER_CONSTRAINT_MISMATCH')
  return true
}

function primaryKeyOn(constraints, column) {
  return constraints.length === 1 && constraints[0].contype === 'p' &&
    new RegExp(`^PRIMARY KEY \\(\\s*${column}\\s*\\)$`, 'iu').test(String(constraints[0].definition))
}

function onePrimaryAndHashChecks(constraints, hashColumns) {
  if (constraints.length !== hashColumns.length + 1) return false
  const primary = constraints.filter(row => row.contype === 'p')
  if (primary.length !== 1 || !/^PRIMARY KEY \(version\)$/iu.test(String(primary[0].definition))) return false
  return hashColumns.every(column => constraints.some(row => row.contype === 'c' &&
    String(row.definition).includes(column) && /\^\[(?:0-9a-f|a-f0-9)\]\{64\}\$/u.test(String(row.definition))))
}

const NATIVE_LEDGER_SHAPE = {
  columns: [
    ['version', 'text', true, null],
    ['name', 'text', true, null],
    ['checksum_sha256', 'character(64)', true, null],
    ['source_revision', 'text', true, null],
    ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ],
  constraints: constraints => onePrimaryAndHashChecks(constraints, ['checksum_sha256']),
}

const LEGACY_LEDGER_SHAPE = {
  columns: [
    ['version', 'text', true, null],
    ['name', 'text', true, null],
    ['checksum', 'character(64)', true, null],
    ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ],
  constraints: constraints => primaryKeyOn(constraints, 'version'),
}

const LOCAL_RECEIPT_SHAPE = {
  columns: [
    ['path', 'text', true, null],
    ['source_sha256', 'character(64)', true, null],
    ['applied_sha256', 'character(64)', true, null],
    ['source_revision', 'text', true, null],
    ['applied_at', 'timestamp with time zone', true, 'clock_timestamp()'],
  ],
  constraints: constraints => {
    if (constraints.length !== 4) return false
    const primary = constraints.filter(row => row.contype === 'p')
    if (primary.length !== 1 || !/^PRIMARY KEY \(path\)$/iu.test(String(primary[0].definition))) return false
    return ['source_sha256', 'applied_sha256', 'source_revision'].every(column => constraints.some(row =>
      row.contype === 'c' && String(row.definition).includes(column) &&
      String(row.definition).includes(column === 'source_revision' ? "'^[a-f0-9]{40}$'" : "'^[a-f0-9]{64}$'")))
  },
}

async function readNativeReceipt(client, version) {
  return rows(client, `
    SELECT version,name,checksum_sha256,source_revision
    FROM ai_pdm_core.schema_migrations WHERE version=$1
  `, [version])
}

function receiptMatches(row, entry, sourceRevision) {
  return row.version === entry.version && row.name === entry.name &&
    String(row.checksum_sha256 ?? '').trimEnd() === entry.appliedSha256 && row.source_revision === sourceRevision
}

export async function insertLedger(client, entry, sourceRevision) {
  if (!validLedgerEntry(entry) || !HASH40.test(sourceRevision ?? '')) throw fail('SOURCE_INVALID')
  await guardTarget(client)
  await assertMigratorRole(client)
  await assertRelationShape(client, PDM_SCHEMA, 'schema_migrations', NATIVE_LEDGER_SHAPE)
  const existing = await readNativeReceipt(client, entry.version)
  if (existing.length > 1) throw fail('LEDGER_READBACK_INVALID')
  if (existing.length === 1) {
    if (!receiptMatches(existing[0], entry, sourceRevision)) throw fail('LEDGER_RECEIPT_MISMATCH')
    return { reused: true }
  }
  await client.query(`
    INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision)
    VALUES($1,$2,$3,$4)
  `, [entry.version, entry.name, entry.appliedSha256, sourceRevision])
  const readback = await readNativeReceipt(client, entry.version)
  if (readback.length !== 1 || !receiptMatches(readback[0], entry, sourceRevision)) throw fail('LEDGER_WRITE_READBACK_FAILED')
  return { reused: false }
}

/**
 * Build the supplemental local-only source entry for the immutable DEV-090
 * PostgreSQL migration. It deliberately stays out of the official native
 * migration ledger; executeMigration records it in the path-bound local receipt.
 * The caller provides source bytes from the selected PDM source snapshot and
 * that snapshot's exact Git revision.
 */
export function buildLocalDev090MigrationSource(sourceBytes, sourceRevision) {
  if ((!Buffer.isBuffer(sourceBytes) && !(sourceBytes instanceof Uint8Array)) || !HASH40.test(sourceRevision ?? '')) {
    throw fail('DEV090_SOURCE_INVALID')
  }
  const bytes = Buffer.from(sourceBytes)
  if (sha256(bytes) !== DEV090_MIGRATION_043.sha256) throw fail('DEV090_SOURCE_HASH_MISMATCH')
  const sql = bytes.toString('utf8')
  if (!Buffer.from(sql, 'utf8').equals(bytes)) throw fail('DEV090_SOURCE_ENCODING_INVALID')

  const entry = Object.freeze({
    owner: OWNER,
    version: DEV090_MIGRATION_043.version,
    name: DEV090_MIGRATION_043.name,
    path: DEV090_MIGRATION_043.path,
    sourceSha256: DEV090_MIGRATION_043.sha256,
    appliedSha256: sha256(Buffer.from(sql, 'utf8')),
    sql,
    localOnly: true,
  })
  if (entry.appliedSha256 !== DEV090_MIGRATION_043.sha256) throw fail('DEV090_APPLIED_HASH_MISMATCH')

  const before = async client => {
    if (!client || typeof client.query !== 'function') throw fail('DEV090_CLIENT_INVALID')
    await client.query('SET LOCAL search_path TO ai_pdm_core, pg_catalog')
    const context = await rows(client, `
      SELECT current_user AS role_name,
             current_schema() AS schema_name,
             current_setting('search_path') AS search_path
    `)
    if (context.length !== 1 || context[0].role_name !== MIGRATOR ||
      context[0].schema_name !== PDM_SCHEMA || context[0].search_path !== 'ai_pdm_core, pg_catalog') {
      throw fail('DEV090_TARGET_CONTEXT_MISMATCH')
    }
  }

  return Object.freeze({ entry, sourceRevision, before })
}

export async function executeMigration(client, entry, sourceRevision, options = {}) {
  validMigrationEntry(entry, sourceRevision)
  if (!options || typeof options !== 'object' ||
    (options.ledgerEntries !== undefined && !Array.isArray(options.ledgerEntries)) ||
    (options.before !== undefined && typeof options.before !== 'function')) throw fail('OPTIONS_INVALID')
  const localOnly = entry.localOnly === true
  const ledgerEntries = options.ledgerEntries ?? []
  if (localOnly && ledgerEntries.length !== 0) throw fail('LOCAL_ONLY_LEDGER_FORBIDDEN')
  if (ledgerEntries.some(item => !validLedgerEntry(item) || item.version === entry.version) ||
    new Set(ledgerEntries.map(item => item.version)).size !== ledgerEntries.length) throw fail('LEDGER_ENTRIES_INVALID')
  if (localOnly && (typeof entry.path !== 'string' ||
    !/^db\/postgres\/[0-9]{3}_[a-zA-Z0-9_.-]+\.sql$/u.test(entry.path) || entry.path.includes('..') ||
    !HASH.test(entry.sourceSha256 ?? ''))) throw fail('LOCAL_ONLY_SOURCE_INVALID')

  await guardTarget(client)
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE ' + MIGRATOR)
    await assertMigratorRole(client)
    await assertSchemaOwner(client, PDM_SCHEMA)
    await assertRelationShape(client, PDM_SCHEMA, 'schema_migrations', NATIVE_LEDGER_SHAPE)

    if (!localOnly) {
      const existing = await readNativeReceipt(client, entry.version)
      if (existing.length > 1) throw fail('LEDGER_READBACK_INVALID')
      if (existing.length === 1) {
        if (!receiptMatches(existing[0], entry, sourceRevision)) throw fail('LEDGER_RECEIPT_MISMATCH')
        await client.query('COMMIT')
        return { reused: true }
      }
    } else {
      const nativeCollision = await readNativeReceipt(client, entry.version)
      if (nativeCollision.length > 0) throw fail('LOCAL_ONLY_NATIVE_LEDGER_COLLISION')
      const relation = await relationInfo(client, PDM_SCHEMA, 'local_native_bootstrap_receipts')
      let receiptTableExists = relation.length === 1
      if (relation.length > 1) throw fail('LOCAL_RECEIPT_TABLE_INVALID')
      if (receiptTableExists) {
        await assertRelationShape(client, PDM_SCHEMA, 'local_native_bootstrap_receipts', LOCAL_RECEIPT_SHAPE)
        await assertNoRuntimeReceiptAcl(client)
        const existing = await readLocalReceipt(client, entry.path)
        if (existing.length > 1) throw fail('LOCAL_RECEIPT_READBACK_INVALID')
        if (existing.length === 1) {
          if (!localReceiptMatches(existing[0], entry, sourceRevision)) throw fail('LOCAL_RECEIPT_MISMATCH')
          await client.query('COMMIT')
          return { reused: true }
        }
      }
      await runMigrationBody(client, entry, options, { localOnly, receiptTableExists })
      if (!receiptTableExists) {
        await createLocalReceiptTable(client)
        receiptTableExists = true
      }
      await assertRelationShape(client, PDM_SCHEMA, 'local_native_bootstrap_receipts', LOCAL_RECEIPT_SHAPE)
      await assertNoRuntimeReceiptAcl(client)
      await insertLocalReceipt(client, entry, sourceRevision)
      await client.query('COMMIT')
      return { reused: false }
    }

    await runMigrationBody(client, entry, options, { localOnly: false })
    await insertLedger(client, entry, sourceRevision)
    for (const ledgerEntry of ledgerEntries) await insertLedger(client, ledgerEntry, sourceRevision)
    await client.query('COMMIT')
    return { reused: false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (String(error?.code ?? '').startsWith('LOCAL_NATIVE_AI_PDM_')) throw error
    const wrapped = fail('MIGRATION_FAILED')
    wrapped.owner = OWNER
    wrapped.sourcePath = entry.path
    if (typeof error?.code === 'string' && /^[0-9A-Z_]{1,64}$/u.test(error.code)) wrapped.databaseCode = error.code
    throw wrapped
  }
}

async function runMigrationBody(client, entry, options, mode) {
  if (options.before) await options.before(client)
  await client.query(entry.sql)
  // Historical 062 deliberately RESETs ROLE for its neutral ownership move.
  // Keep its immutable SQL/hash intact, then restore this owner for receipt DML.
  await client.query('SET LOCAL ROLE ' + MIGRATOR)
  await assertMigratorRole(client)
  if (!mode.localOnly) return
  // Local-only bootstrap receipts are created after migration 062, avoiding
  // the native baseline's broad one-time runtime grants on existing tables.
}

export async function createLedger(client, sourceRevision, audit) {
  if (!HASH40.test(sourceRevision ?? '') || !audit || !Array.isArray(audit.bootstrapObjects)) throw fail('SOURCE_INVALID')
  let created = false
  await transact(client, async () => {
    await assertMigratorRole(client)
    await assertSchemaOwner(client, PDM_SCHEMA)
    const existing = await relationInfo(client, PDM_SCHEMA, 'schema_migrations')
    if (existing.length > 1) throw fail('LEDGER_RELATION_INVALID')
    created = existing.length === 0
    await client.query(`CREATE TABLE IF NOT EXISTS ai_pdm_core.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      source_revision text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`)
    await assertRelationShape(client, PDM_SCHEMA, 'schema_migrations', NATIVE_LEDGER_SHAPE)
  })
  if (created) audit.bootstrapObjects.push({ owner: MIGRATOR, object: 'ai_pdm_core.schema_migrations', sourceRevision })
  return { reused: !created }
}

export async function createLegacyStage(client) {
  let reused = false
  await transact(client, async () => {
    await assertMigratorRole(client)
    const before = await rows(client, `
      SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname=$1
    `, [LEGACY_SCHEMA])
    if (before.length > 1) throw fail('LEGACY_SCHEMA_INVALID')
    reused = before.length === 1
    await client.query(`CREATE SCHEMA IF NOT EXISTS ai_pdm_legacy_stage AUTHORIZATION ${MIGRATOR}`)
    await assertSchemaOwner(client, LEGACY_SCHEMA)
  })
  return { reused }
}

const LEGACY_STAGE_REVOKE = `REVOKE ALL ON TABLE ai_pdm_legacy_stage.pdm_schema_migrations
  FROM PUBLIC, ${RUNTIME_ROLES.join(', ')}`

export async function preparePdmLegacyLedger(client, legacyLedger) {
  await assertMigratorRole(client)
  await guardTarget(client)
  if (!Array.isArray(legacyLedger) || legacyLedger.length < 1 || legacyLedger.some(entry =>
    !entry || typeof entry.version !== 'string' || !/^\d{3}$/u.test(entry.version) ||
    typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/u.test(entry.name) ||
    !HASH.test(entry.checksum ?? '')) || new Set(legacyLedger.map(entry => entry.version)).size !== legacyLedger.length) {
    throw fail('LEGACY_LEDGER_INVALID')
  }
  await assertSchemaOwner(client, PDM_SCHEMA)
  await assertRelationShape(client, PDM_SCHEMA, 'schema_migrations', NATIVE_LEDGER_SHAPE)
  if ((await readNativeReceipt(client, '062')).length > 0) throw fail('LEGACY_LEDGER_AFTER_062')
  await assertSchemaOwner(client, LEGACY_SCHEMA)
  const existingRelation = await relationInfo(client, LEGACY_SCHEMA, 'pdm_schema_migrations')
  if (existingRelation.length > 1) throw fail('LEGACY_LEDGER_RELATION_INVALID')
  const existed = existingRelation.length === 1
  await client.query(`CREATE TABLE IF NOT EXISTS ai_pdm_legacy_stage.pdm_schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`)
  if (!existed) await client.query(LEGACY_STAGE_REVOKE)
  await assertRelationShape(client, LEGACY_SCHEMA, 'pdm_schema_migrations', LEGACY_LEDGER_SHAPE)
  const before = await readLegacyLedger(client)
  if (before.length > 0 && !legacyLedgerEqual(before, legacyLedger)) throw fail('LEGACY_LEDGER_MISMATCH')
  if (before.length === 0) {
    for (const entry of legacyLedger) await client.query(
      'INSERT INTO ai_pdm_legacy_stage.pdm_schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
      [entry.version, entry.name, entry.checksum])
  }
  const readback = await readLegacyLedger(client)
  if (!legacyLedgerEqual(readback, legacyLedger)) throw fail('LEGACY_LEDGER_READBACK_FAILED')
  return { reused: before.length > 0 }
}

async function readLegacyLedger(client) {
  return rows(client, `
    SELECT version,name,checksum FROM ai_pdm_legacy_stage.pdm_schema_migrations ORDER BY version
  `)
}

function legacyLedgerEqual(observed, expected) {
  const sorted = [...expected].sort((a, b) => a.version.localeCompare(b.version))
  return observed.length === sorted.length && observed.every((row, index) =>
    row.version === sorted[index].version && row.name === sorted[index].name &&
    String(row.checksum ?? '').trimEnd() === sorted[index].checksum)
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizedJson(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function catalogInputValid(catalog) {
  return Boolean(catalog && typeof catalog === 'object' && catalog.applicationId === OWNER &&
    catalog.catalogVersion === V3_CATALOG_VERSION && typeof catalog.contractVersion === 'string' &&
    typeof catalog.publishedAt === 'string' && Number.isFinite(Date.parse(catalog.publishedAt)) &&
    HASH.test(catalog.catalogSha256 ?? '') && Array.isArray(catalog.roles) && catalog.roles.length === 9 &&
    catalog.roles.every(role => role && typeof role.stableRoleId === 'string' && typeof role.roleCode === 'string' &&
      typeof role.displayName === 'string' && typeof role.assignable === 'boolean' && typeof role.risk === 'string' &&
      typeof role.subjectKind === 'string' && typeof role.recommendationAllowed === 'boolean' &&
      typeof role.delegationAllowed === 'boolean' && Array.isArray(role.allowedScopeKinds) &&
      typeof role.assignmentTier === 'string' && Array.isArray(role.permissions) && HASH.test(role.roleDefinitionHash ?? '')) &&
    new Set(catalog.roles.map(role => role.stableRoleId)).size === 9)
}

const CATALOG_PUBLISHED_BY = 'DEV-013 local native baseline'
const CATALOG_ACTIVATED_BY = 'DEV-013 local native baseline'
const CATALOG_ACTIVATION_REASON = 'native current catalog required by migration 066'

async function readCatalogState(client, catalogVersion) {
  const publications = await rows(client, `
    SELECT catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by,retired_at
    FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=$1
  `, [catalogVersion])
  const roles = await rows(client, `
    SELECT display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
           recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,
           permissions,metadata,role_definition_hash
    FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1
    ORDER BY display_order,stable_role_id
  `, [catalogVersion])
  const active = await rows(client, `
    SELECT application_id,catalog_version,activated_at,activated_by,activation_reason
    FROM ai_pdm_core.active_role_catalog WHERE application_id='ai-pdm'
  `)
  return { publications, roles, active }
}

function catalogRoleMatches(observed, role, index) {
  return Number(observed.display_order) === index && observed.stable_role_id === role.stableRoleId &&
    observed.role_code === role.roleCode && observed.display_name === role.displayName &&
    observed.assignable === role.assignable && observed.risk === role.risk && observed.subject_kind === role.subjectKind &&
    observed.recommendation_allowed === role.recommendationAllowed && observed.delegation_allowed === role.delegationAllowed &&
    canonicalJson(normalizedJson(observed.allowed_scope_kinds)) === canonicalJson(role.allowedScopeKinds) &&
    observed.assignment_tier === role.assignmentTier &&
      canonicalJson(normalizedJson(observed.permissions)) === canonicalJson(role.permissions) &&
    canonicalJson(normalizedJson(observed.metadata)) === canonicalJson(role.metadata ?? null) &&
    observed.role_definition_hash === role.roleDefinitionHash
}

function catalogStateMatches(state, catalog) {
  if (state.publications.length !== 1 || state.roles.length !== 9 || state.active.length !== 1) return false
  const publication = state.publications[0]
  const active = state.active[0]
  const publicationTimeValue = new Date(publication.published_at).getTime()
  const expectedPublicationTimeValue = new Date(catalog.publishedAt).getTime()
  const activationTimeValue = new Date(active.activated_at).getTime()
  if (!Number.isFinite(publicationTimeValue) || !Number.isFinite(expectedPublicationTimeValue) ||
    !Number.isFinite(activationTimeValue)) return false
  const publicationTime = new Date(publicationTimeValue).toISOString()
  return publication.catalog_version === catalog.catalogVersion && publication.contract_version === catalog.contractVersion &&
    publication.application_id === OWNER && publicationTime === new Date(catalog.publishedAt).toISOString() &&
    String(publication.catalog_sha256 ?? '').trimEnd() === catalog.catalogSha256 && publication.status === 'active' &&
    publication.published_by === CATALOG_PUBLISHED_BY && publication.retired_at == null &&
    active.application_id === OWNER && active.catalog_version === catalog.catalogVersion &&
    active.activated_by === CATALOG_ACTIVATED_BY && active.activation_reason === CATALOG_ACTIVATION_REASON &&
    Number.isFinite(activationTimeValue) &&
    state.roles.every((row, index) => catalogRoleMatches(row, catalog.roles[index], index))
}

export async function seedPdmBaselineCatalog(client, catalog) {
  await assertMigratorRole(client)
  await guardTarget(client)
  if (!catalogInputValid(catalog)) throw fail('CATALOG_SOURCE_INVALID')
  await assertSchemaOwner(client, PDM_SCHEMA)
  await assertRelationShape(client, PDM_SCHEMA, 'schema_migrations', NATIVE_LEDGER_SHAPE)
  if ((await readNativeReceipt(client, '066')).length > 0) throw fail('CATALOG_SEED_AFTER_066')
  const existing = await readCatalogState(client, catalog.catalogVersion)
  if (catalogStateMatches(existing, catalog)) return { reused: true }
  if (existing.publications.length !== 0 || existing.roles.length !== 0 || existing.active.length !== 0) {
    throw fail('CATALOG_STATE_MISMATCH')
  }

  await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications
    (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
    VALUES($1,$2,$3,$4,$5,'active',$6)`,
  [catalog.catalogVersion, catalog.contractVersion, catalog.applicationId, catalog.publishedAt,
    catalog.catalogSha256, CATALOG_PUBLISHED_BY])
  for (const [order, role] of catalog.roles.entries()) await client.query(`INSERT INTO ai_pdm_core.role_catalog_entries
    (catalog_version,display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
     recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`,
  [catalog.catalogVersion, order, role.stableRoleId, role.roleCode, role.displayName, role.assignable, role.risk,
    role.subjectKind, role.recommendationAllowed, role.delegationAllowed, JSON.stringify(role.allowedScopeKinds),
    role.assignmentTier, JSON.stringify(role.permissions), JSON.stringify(role.metadata ?? null), role.roleDefinitionHash])
  await client.query(`INSERT INTO ai_pdm_core.active_role_catalog
    (application_id,catalog_version,activated_at,activated_by,activation_reason)
    VALUES('ai-pdm',$1,clock_timestamp(),$2,$3)`,
  [catalog.catalogVersion, CATALOG_ACTIVATED_BY, CATALOG_ACTIVATION_REASON])
  const readback = await readCatalogState(client, catalog.catalogVersion)
  if (!catalogStateMatches(readback, catalog)) throw fail('CATALOG_READBACK_FAILED')
  return { reused: false }
}

const LOCAL_RECEIPT_REVOKE = `REVOKE ALL ON TABLE ai_pdm_core.local_native_bootstrap_receipts
  FROM PUBLIC, ${RUNTIME_ROLES.join(', ')}`

async function createLocalReceiptTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS ai_pdm_core.local_native_bootstrap_receipts (
    path text PRIMARY KEY,
    source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    applied_sha256 char(64) NOT NULL CHECK (applied_sha256 ~ '^[a-f0-9]{64}$'),
    source_revision text NOT NULL CHECK (source_revision ~ '^[a-f0-9]{40}$'),
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
  )`)
  await client.query(LOCAL_RECEIPT_REVOKE)
}

async function assertNoRuntimeReceiptAcl(client) {
  const result = await rows(client, `
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,'{}'::aclitem[])) acl
      LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
      WHERE n.nspname=$1 AND c.relname=$2
        AND (acl.grantee=0 OR grantee.rolname=ANY($3::text[]))
    ) AS forbidden_acl
  `, [PDM_SCHEMA, 'local_native_bootstrap_receipts', RUNTIME_ROLES])
  if (result.length !== 1 || result[0].forbidden_acl !== false) throw fail('LOCAL_RECEIPT_ACL_INVALID')
}

async function readLocalReceipt(client, path) {
  return rows(client, `
    SELECT path,source_sha256,applied_sha256,source_revision
    FROM ai_pdm_core.local_native_bootstrap_receipts WHERE path=$1
  `, [path])
}

function localReceiptMatches(row, entry, sourceRevision) {
  return row.path === entry.path && String(row.source_sha256 ?? '').trimEnd() === entry.sourceSha256 &&
    String(row.applied_sha256 ?? '').trimEnd() === entry.appliedSha256 && row.source_revision === sourceRevision
}

async function insertLocalReceipt(client, entry, sourceRevision) {
  await client.query(`
    INSERT INTO ai_pdm_core.local_native_bootstrap_receipts(path,source_sha256,applied_sha256,source_revision)
    VALUES($1,$2,$3,$4)
  `, [entry.path, entry.sourceSha256, entry.appliedSha256, sourceRevision])
  const readback = await readLocalReceipt(client, entry.path)
  if (readback.length !== 1 || !localReceiptMatches(readback[0], entry, sourceRevision)) {
    throw fail('LOCAL_RECEIPT_WRITE_READBACK_FAILED')
  }
}

export async function verifyNoSessions(client) {
  await guardTarget(client)
  await assertSchemaOwner(client, PDM_SCHEMA)
  const relation = await rows(client, `
    SELECT c.relkind FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname='principal_session_records'
  `, [PDM_SCHEMA])
  if (relation.length === 0) return true
  if (relation.length !== 1 || !['r', 'p'].includes(relation[0].relkind)) throw fail('SESSION_CATALOG_INVALID')
  const count = await rows(client, 'SELECT count(*)::text AS session_count FROM ai_pdm_core.principal_session_records')
  if (count.length !== 1 || !/^(0|[1-9][0-9]*)$/u.test(String(count[0].session_count))) throw fail('SESSION_READBACK_INVALID')
  return count[0].session_count === '0'
}

export async function verifyLocalObjects(client) {
  await guardTarget(client)
  const result = await rows(client, "SELECT to_regclass('ai_pdm_core.local_sandbox_principal_session_bindings') IS NOT NULL AS ready")
  if (result.length !== 1 || result[0].ready !== true) throw fail('LOCAL_OBJECTS_MISSING')
  return ['ai_pdm_core.local_sandbox_principal_session_bindings']
}
