#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync, gunzipSync } from 'node:zlib'
import pg from 'pg'
import {
  assertDataBundle,
  assertDataCutoverConfig,
  assertEquivalentCutoverReceipt,
  assertExistingRowsAreExpectedSubset,
  assertSourceInspectionReceipt,
  assertTargetInspectionReceipt,
  buildInsertSql,
  canonicalize,
  createDataBundle,
  DataCutoverError,
  deriveDataMigrationPlan,
  parseRuntimeArgs,
  quoteIdentifier,
  sha256,
  sortRowsByPrimaryKey,
  summarizeRows,
  transformSourceRow,
} from './lib/dev012-production-data-cutover.mjs'
import {
  metadataAccessToken,
  parseGsUri,
  publishGcsJson,
  readGcsObject,
} from './lib/dev012-production-migration-runner.mjs'

const { Client } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config/release/dev012-ai-pdm-production-data-cutover.json')

function fail(code, detail = '') { throw new DataCutoverError(code, detail) }

async function metadataText(pathname) {
  const response = await fetch(`http://metadata.google.internal/computeMetadata/v1/${pathname}`, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) fail('DATA_CUTOVER_METADATA_FAILED', pathname)
  return (await response.text()).trim()
}

async function assertRuntime(config, args, environment) {
  if (environment.PDM_SOURCE_REVISION !== args.sourceRevision) fail('DATA_CUTOVER_IMAGE_SOURCE_MISMATCH')
  const [projectId, projectNumber] = await Promise.all([metadataText('project/project-id'), metadataText('project/numeric-project-id')])
  const sourceMode = ['inspect-source', 'export'].includes(args.mode)
  const target = sourceMode ? config.source : config.target
  if (projectId !== target.projectId || projectNumber !== target.projectNumber) fail('DATA_CUTOVER_RUNTIME_PROJECT_MISMATCH')
  const expectedJob = sourceMode ? /^dev012-ai-data-export-[a-f0-9]{12}$/u : /^dev012-ai-data-import-[a-f0-9]{12}$/u
  if (!expectedJob.test(environment.CLOUD_RUN_JOB ?? '') || environment.CUTOVER_DATABASE !== target.database || environment.CUTOVER_DATABASE_LOGIN !== target.databaseLogin || environment.CUTOVER_INSTANCE_CONNECTION_NAME !== target.instanceConnectionName) fail('DATA_CUTOVER_RUNTIME_ENVIRONMENT_MISMATCH')
  return target
}

export async function readCatalog(database, schema) {
  const tables = (await database.query(`
    SELECT c.relname AS name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind IN ('r','p')
    ORDER BY c.relname
  `, [schema])).rows
  const columns = (await database.query(`
    SELECT c.relname AS table_name, a.attnum AS ordinal, a.attname AS name,
           pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
           a.attnotnull AS not_null, (d.adbin IS NOT NULL) AS has_default,
           a.attgenerated AS generated, a.attidentity AS identity
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum
  `, [schema])).rows
  const primaryKeys = (await database.query(`
    SELECT c.relname AS table_name,
           ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY key(attnum,ord)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=key.attnum ORDER BY key.ord)::text[] AS columns
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND con.contype='p'
    ORDER BY c.relname
  `, [schema])).rows
  const foreignKeys = (await database.query(`
    SELECT child.relname AS "childTable", parent.relname AS "parentTable", con.conname AS "constraintName",
           con.condeferrable AS deferrable,
           ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY key(attnum,ord)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=key.attnum ORDER BY key.ord)::text[] AS "childColumns",
           ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY key(attnum,ord)
                 JOIN pg_catalog.pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=key.attnum ORDER BY key.ord)::text[] AS "parentColumns"
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid=con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid=child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid=con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
    WHERE con.contype='f' AND child_ns.nspname=$1 AND parent_ns.nspname=$1
    ORDER BY child.relname,parent.relname,con.conname
  `, [schema])).rows
  const columnsByTable = new Map()
  for (const column of columns) {
    const value = { name: column.name, type: column.type, notNull: column.not_null, hasDefault: column.has_default, generated: column.generated, identity: column.identity }
    if (!columnsByTable.has(column.table_name)) columnsByTable.set(column.table_name, [])
    columnsByTable.get(column.table_name).push(value)
  }
  const primaryKeyByTable = new Map(primaryKeys.map((item) => [item.table_name, item.columns]))
  const resultTables = []
  for (const table of tables) {
    const count = Number((await database.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)}`)).rows[0].count)
    resultTables.push({ name: table.name, rowCount: count, columns: columnsByTable.get(table.name) ?? [], primaryKey: primaryKeyByTable.get(table.name) ?? [] })
  }
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database: (await database.query('SELECT current_database() AS name')).rows[0].name, schema, tables: resultTables, foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

async function readTableRows(database, schema, table) {
  const order = table.primaryKey.length > 0 ? ` ORDER BY ${table.primaryKey.map(quoteIdentifier).join(',')}` : ''
  const result = await database.query(`SELECT row_to_json(source_row) AS row FROM (SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)}${order}) source_row`)
  return result.rows.map((item) => item.row)
}

async function publishGcsBytes({ uri, config, expectedPrefix, bytes, token }) {
  const ref = parseGsUri(uri, config.releaseBucket, expectedPrefix)
  const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(ref.bucket)}/o?uploadType=media&name=${encodeURIComponent(ref.object)}&ifGenerationMatch=0`
  const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip' }, body: bytes, signal: AbortSignal.timeout(120_000) })
  if (response.status === 412) {
    const existing = await readGcsObject({ uri, expectedBucket: config.releaseBucket, expectedPrefix, token })
    if (!existing.bytes.equals(bytes)) fail('DATA_CUTOVER_GCS_IMMUTABILITY_CONFLICT')
    return { generation: existing.generation, bytesSha256: sha256(bytes), bytes: bytes.length, reused: true }
  }
  if (!response.ok) fail('DATA_CUTOVER_GCS_UPLOAD_FAILED', String(response.status))
  const metadata = await response.json()
  const readback = await readGcsObject({ uri, expectedBucket: config.releaseBucket, expectedPrefix, token })
  if (!readback.bytes.equals(bytes) || String(metadata.generation) !== readback.generation) fail('DATA_CUTOVER_GCS_READBACK_MISMATCH')
  return { generation: readback.generation, bytesSha256: sha256(bytes), bytes: bytes.length, reused: false }
}

async function publishCutoverReceipt({ uri, config, expectedPrefix, receipt, token }) {
  try {
    await publishGcsJson({ uri, expectedBucket: config.releaseBucket, expectedPrefix, value: receipt, token })
    return receipt
  } catch (error) {
    if (error?.code !== 'MIGRATION_GCS_IMMUTABILITY_CONFLICT') throw error
    const existing = await readGcsObject({ uri, expectedBucket: config.releaseBucket, expectedPrefix, token })
    let parsed
    try { parsed = JSON.parse(existing.bytes.toString('utf8')) } catch { fail('DATA_CUTOVER_RECEIPT_DECODE_FAILED') }
    return assertEquivalentCutoverReceipt(parsed, receipt)
  }
}

function databaseOptions(target, token, environment) {
  const options = { host: environment.CUTOVER_DATABASE_HOST, database: target.database, user: target.databaseLogin, password: token, ssl: false, application_name: `dev012-ai-pdm-data-${environment.CUTOVER_MODE}`, connectionTimeoutMillis: 20_000, query_timeout: 180_000, statement_timeout: 180_000 }
  if (environment.CUTOVER_DATABASE_PORT) options.port = Number(environment.CUTOVER_DATABASE_PORT)
  return options
}

async function inspectSourceIdentity(database, config, identityUid) {
  const selected = (await database.query(`SELECT count(*)::integer AS count, min(id) AS id, min(company_id) AS company_id,
    min(role) AS role, min(account_status) AS account_status, min(account_lifecycle_version)::integer AS account_lifecycle_version,
    count(*) FILTER (WHERE account_status=$2 AND system_role_enabled<>0)::integer AS active_count
    FROM ${quoteIdentifier(config.source.schema)}.users WHERE lower(btrim(email))=lower($1)`, [config.identityRemap.email, config.identityRemap.accountStatus])).rows[0]
  if (selected.count !== 1 || selected.active_count !== 1 || selected.id !== config.identityRemap.pdmUserId || selected.company_id !== config.identityRemap.companyId || selected.role !== config.identityRemap.role || selected.account_status !== config.identityRemap.accountStatus || selected.account_lifecycle_version !== config.identityRemap.accountLifecycleVersion) fail('DATA_CUTOVER_IDENTITY_SOURCE_USER_INVALID')
  const mapping = (await database.query(`SELECT count(*)::integer AS count,
    count(*) FILTER (WHERE mapping_source=$2 AND mapping_status=$3)::integer AS active_count
    FROM ${quoteIdentifier(config.source.schema)}.platform_principal_mappings WHERE pdm_user_id=$1`, [config.identityRemap.pdmUserId, config.identityRemap.mappingSource, config.identityRemap.mappingStatus])).rows[0]
  const collision = Number((await database.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(config.source.schema)}.platform_principal_mappings WHERE external_subject=$1`, [identityUid])).rows[0].count)
  if (mapping.count !== 1 || mapping.active_count !== 1 || collision !== 0) fail('DATA_CUTOVER_IDENTITY_SOURCE_MAPPING_INVALID')
  return { pdmUserId: selected.id, companyId: selected.company_id, role: selected.role, accountStatus: selected.account_status, accountLifecycleVersion: selected.account_lifecycle_version, priorMappingCount: mapping.count, currentUidCollisionCount: collision }
}

export async function readSourceSessions(database) {
  const row = (await database.query(`SELECT
    count(*)::integer AS other_session_count,
    count(*) FILTER (WHERE state IS NULL)::integer AS hidden_session_count,
    count(*) FILTER (WHERE xact_start IS NOT NULL)::integer AS active_transaction_count,
    count(*) FILTER (WHERE state IS DISTINCT FROM 'idle')::integer AS active_non_idle_count,
    count(*) FILTER (WHERE lower(coalesce(application_name,'')) LIKE '%migration%')::integer AS active_migration_session_count
    FROM pg_catalog.pg_stat_activity
    WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()`)).rows[0]
  return { otherSessionCount: row.other_session_count, hiddenSessionCount: row.hidden_session_count, activeTransactionCount: row.active_transaction_count, activeNonIdleCount: row.active_non_idle_count, activeMigrationSessionCount: row.active_migration_session_count }
}

export async function inspectSourceSessions(database) {
  const result = await readSourceSessions(database)
  if (result.hiddenSessionCount !== 0 || result.activeTransactionCount !== 0 || result.activeNonIdleCount !== 0 || result.activeMigrationSessionCount !== 0) fail('DATA_CUTOVER_SOURCE_SESSION_NOT_DRAINED')
  return result
}

async function readSeedSummaries(database, config, target) {
  const catalog = await readCatalog(database, target.schema)
  const seedSummaries = {}
  for (const tableName of Object.keys(config.catalog.allowedTargetSeedRows).sort()) {
    const table = catalog.tables.find((item) => item.name === tableName)
    if (!table) fail('DATA_CUTOVER_SEED_TABLE_MISSING', tableName)
    seedSummaries[tableName] = summarizeRows(await readTableRows(database, target.schema, table), table.primaryKey)
  }
  return { catalog, seedSummaries }
}

async function inspectTargetUid(database, config, identityUid) {
  return Number((await database.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(config.target.schema)}.platform_principal_mappings WHERE external_subject=$1 AND mapping_source=$2 AND mapping_status=$3`, [identityUid, config.identityRemap.mappingSource, config.identityRemap.mappingStatus])).rows[0].count)
}

async function runInspection({ config, args, environment, token }) {
  const sourceMode = args.mode === 'inspect-source'
  const target = sourceMode ? config.source : config.target
  const database = new Client(databaseOptions(target, token, environment))
  await database.connect()
  try {
    const { catalog, seedSummaries } = await readSeedSummaries(database, config, target)
    const base = { ownerApplicationId: 'ai-pdm', releaseId: args.releaseId, sourceRevision: args.sourceRevision, projectId: target.projectId, database: target.database, schema: target.schema, identityReceiptSha256: args.identityReceiptSha256, executionName: environment.CLOUD_RUN_EXECUTION, catalog, seedSummaries, totalRowCount: catalog.tables.reduce((sum, table) => sum + table.rowCount, 0), rawRowsLogged: false, completedAt: new Date().toISOString(), status: 'PASS' }
    let core
    if (sourceMode) {
      const sessionSnapshot = await readSourceSessions(database)
      if (sessionSnapshot.hiddenSessionCount !== 0 || sessionSnapshot.activeMigrationSessionCount !== 0) fail('DATA_CUTOVER_SOURCE_INSPECTION_SESSION_INVALID')
      core = { schemaVersion: 'jenfu.dev012.ai-pdm-source-inspection-receipt.v1', ...base, identity: await inspectSourceIdentity(database, config, args.identityUid), sessionSnapshot }
    } else {
      core = { schemaVersion: 'jenfu.dev012.ai-pdm-target-inspection-receipt.v1', ...base, activeUidMappingCount: await inspectTargetUid(database, config, args.identityUid) }
    }
    const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
    if (sourceMode) assertSourceInspectionReceipt(receipt, config, { releaseId: args.releaseId, sourceRevision: args.sourceRevision })
    else assertTargetInspectionReceipt(receipt, config, { releaseId: args.releaseId, sourceRevision: args.sourceRevision })
    return publishCutoverReceipt({ uri: args.receiptRef, config, expectedPrefix: sourceMode ? 'source/migration-bundles' : 'receipts', receipt, token })
  } finally { await database.end() }
}

async function runExport({ config, args, environment, token }) {
  if (args.acknowledgement !== config.acknowledgements.export) fail('DATA_CUTOVER_EXPORT_ACKNOWLEDGEMENT_REQUIRED')
  const database = new Client(databaseOptions(config.source, token, environment))
  await database.connect()
  try {
    const sourceSessionPreflight = await inspectSourceSessions(database)
    await database.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const identity = await inspectSourceIdentity(database, config, args.identityUid)
    const catalog = await readCatalog(database, config.source.schema)
    for (const table of catalog.tables) if (table.rowCount > 0 && table.primaryKey.length === 0) fail('DATA_CUTOVER_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY', table.name)
    const rowsByTable = new Map()
    for (const table of catalog.tables) if (!(table.name in config.catalog.sourceExcludedTables)) rowsByTable.set(table.name, await readTableRows(database, config.source.schema, table))
    const bundle = createDataBundle({ config, sourceRevision: args.sourceRevision, releaseId: args.releaseId, identityUid: args.identityUid, identityReceiptSha256: args.identityReceiptSha256, sourceCatalog: catalog, rowsByTable })
    const compressed = gzipSync(Buffer.from(`${canonicalize(bundle)}\n`, 'utf8'), { level: 9, mtime: 0 })
    const publication = await publishGcsBytes({ uri: args.bundleRef, config, expectedPrefix: 'source/migration-bundles', bytes: compressed, token })
    await database.query('ROLLBACK')
    const core = { schemaVersion: 'jenfu.dev012.ai-pdm-data-export-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: args.releaseId, sourceRevision: args.sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256: args.identityReceiptSha256, executionName: environment.CLOUD_RUN_EXECUTION, transactionMode: 'REPEATABLE_READ_READ_ONLY', sourceSessionPreflight, sourceCatalogSha256: catalog.catalogSha256, copyTableCount: bundle.tables.length, sourceRowCount: bundle.tables.reduce((sum, table) => sum + table.sourceSummary.rowCount, 0), identity, bundleRef: args.bundleRef, bundleGeneration: publication.generation, bundleBytesSha256: publication.bytesSha256, bundleBytes: publication.bytes, bundleSha256: bundle.bundleSha256, rawRowsLogged: false, completedAt: new Date().toISOString(), status: 'PASS' }
    const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
    return publishCutoverReceipt({ uri: args.receiptRef, config, expectedPrefix: 'source/migration-bundles', receipt, token })
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { await database.end() }
}

export async function readTargetRows(database, config, table) {
  const rows = await readTableRows(database, config.target.schema, table)
  return sortRowsByPrimaryKey(rows, table.primaryKey)
}

export async function insertTableRows(database, config, table, rows) {
  const insertableColumns = table.columns.filter((column) => !column.generated && !column.identity).map((column) => column.name)
  const sql = buildInsertSql(config.target.schema, table.name, insertableColumns)
  let pending = [...rows]
  let inserted = 0
  for (let round = 0; pending.length > 0; round += 1) {
    const next = []; let progress = 0
    for (const row of pending) {
      await database.query('SAVEPOINT dev012_row_insert')
      try {
        const result = await database.query(sql, [JSON.stringify(row)])
        await database.query('RELEASE SAVEPOINT dev012_row_insert')
        inserted += result.rowCount; progress += 1
      } catch (error) {
        await database.query('ROLLBACK TO SAVEPOINT dev012_row_insert')
        await database.query('RELEASE SAVEPOINT dev012_row_insert')
        if (error.code === '23503') next.push(row)
        else throw error
      }
    }
    if (next.length > 0 && progress === 0) fail('DATA_CUTOVER_SELF_FOREIGN_KEY_DID_NOT_CONVERGE', table.name)
    pending = next
    if (round > rows.length) fail('DATA_CUTOVER_SELF_FOREIGN_KEY_DID_NOT_CONVERGE', table.name)
  }
  return inserted
}

async function assertTargetIdentity(database, config, identityUid) {
  const row = (await database.query(`SELECT count(*)::integer AS count, min(u.id) AS id, min(u.company_id) AS company_id,
    min(u.role) AS role, min(u.account_status) AS account_status, min(u.account_lifecycle_version)::integer AS account_lifecycle_version
    FROM ${quoteIdentifier(config.target.schema)}.platform_principal_mappings m
    JOIN ${quoteIdentifier(config.target.schema)}.users u ON u.id=m.pdm_user_id
    WHERE m.external_subject=$1 AND m.mapping_source=$2 AND m.mapping_status=$3`, [identityUid, config.identityRemap.mappingSource, config.identityRemap.mappingStatus])).rows[0]
  if (row.count !== 1 || row.id !== config.identityRemap.pdmUserId || row.company_id !== config.identityRemap.companyId || row.role !== config.identityRemap.role || row.account_status !== config.identityRemap.accountStatus || row.account_lifecycle_version !== config.identityRemap.accountLifecycleVersion) fail('DATA_CUTOVER_TARGET_IDENTITY_INVALID')
  return row
}

async function runImport({ config, args, environment, token }) {
  if (args.acknowledgement !== config.acknowledgements.import) fail('DATA_CUTOVER_IMPORT_ACKNOWLEDGEMENT_REQUIRED')
  const object = await readGcsObject({ uri: args.bundleRef, expectedBucket: config.releaseBucket, expectedPrefix: 'source/migration-bundles', token })
  if (object.generation !== args.bundleGeneration || sha256(object.bytes) !== args.bundleSha256) fail('DATA_CUTOVER_BUNDLE_OBJECT_MISMATCH')
  let bundle
  try { bundle = JSON.parse(gunzipSync(object.bytes).toString('utf8')) } catch { fail('DATA_CUTOVER_BUNDLE_DECODE_FAILED') }
  assertDataBundle(bundle, config, { releaseId: args.releaseId, sourceRevision: args.sourceRevision })
  const database = new Client(databaseOptions(config.target, token, environment))
  await database.connect()
  let committed = false
  try {
    await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await database.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext(current_database()))", [`dev012-ai-pdm-data-${args.releaseId}`])
    const targetCatalog = await readCatalog(database, config.target.schema)
    const plan = deriveDataMigrationPlan(config, bundle.sourceCatalog, targetCatalog, { allowPopulatedTarget: true })
    if (canonicalize(plan.copyTables) !== canonicalize(bundle.plan.copyTables) || canonicalize(plan.transforms) !== canonicalize(bundle.plan.transforms)) fail('DATA_CUTOVER_IMPORT_PLAN_MISMATCH')
    const bundleByName = new Map(bundle.tables.map((table) => [table.name, table]))
    for (const tableName of plan.copyTables) {
      const targetTable = targetCatalog.tables.find((table) => table.name === tableName)
      const existing = await readTargetRows(database, config, targetTable)
      const expected = bundleByName.get(tableName).rows.map((row) => transformSourceRow(config, tableName, row, bundle.identityUid))
      assertExistingRowsAreExpectedSubset(existing, expected, tableName)
    }
    let insertedRows = 0
    const tableReceipts = []
    for (const tableName of plan.tableOrder) {
      const targetTable = targetCatalog.tables.find((table) => table.name === tableName)
      const bundleTable = bundleByName.get(tableName)
      const transformed = bundleTable.rows.map((row) => transformSourceRow(config, tableName, row, bundle.identityUid))
      insertedRows += await insertTableRows(database, config, targetTable, transformed)
      const observedRows = await readTargetRows(database, config, targetTable)
      const summary = summarizeRows(observedRows, targetTable.primaryKey)
      if (canonicalize(summary) !== canonicalize(bundleTable.targetSummary)) fail('DATA_CUTOVER_TARGET_RECONCILIATION_FAILED', tableName)
      tableReceipts.push({ name: tableName, ...summary })
    }
    const identity = await assertTargetIdentity(database, config, bundle.identityUid)
    await database.query('COMMIT'); committed = true
    const core = { schemaVersion: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: args.releaseId, sourceRevision: args.sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256: bundle.identityReceiptSha256, executionName: environment.CLOUD_RUN_EXECUTION, sourceCatalogSha256: bundle.sourceCatalog.catalogSha256, targetPreImportCatalogSha256: targetCatalog.catalogSha256, migrationPlanSha256: plan.planSha256, bundleRef: args.bundleRef, bundleGeneration: args.bundleGeneration, bundleBytesSha256: args.bundleSha256, bundleSha256: bundle.bundleSha256, tableCount: tableReceipts.length, expectedRowCount: bundle.tables.reduce((sum, table) => sum + table.targetSummary.rowCount, 0), insertedRows, tableReceipts, identity: { pdmUserId: identity.id, companyId: identity.company_id, role: identity.role, accountStatus: identity.account_status, accountLifecycleVersion: identity.account_lifecycle_version, activeUidMappingCount: identity.count }, transaction: 'SERIALIZABLE_COMMITTED', sourceProductionWrites: false, siblingSchemaWrites: 0, rawRowsLogged: false, completedAt: new Date().toISOString(), status: 'PASS' }
    const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
    return publishCutoverReceipt({ uri: args.receiptRef, config, expectedPrefix: 'receipts', receipt, token })
  } catch (error) {
    if (!committed) await database.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { await database.end() }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env } = {}) {
  const config = assertDataCutoverConfig(JSON.parse(await fs.readFile(configPath, 'utf8')))
  const args = parseRuntimeArgs(argv, config)
  environment.CUTOVER_MODE = args.mode
  await assertRuntime(config, args, environment)
  const token = await metadataAccessToken()
  if (args.mode.startsWith('inspect-')) return runInspection({ config, args, environment, token })
  return args.mode === 'export' ? runExport({ config, args, environment, token }) : runImport({ config, args, environment, token })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((receipt) => process.stdout.write(`${JSON.stringify({ schemaVersion: receipt.schemaVersion, releaseId: receipt.releaseId, sourceRevision: receipt.sourceRevision, receiptSha256: receipt.receiptSha256, tableCount: receipt.copyTableCount ?? receipt.tableCount, rowCount: receipt.sourceRowCount ?? receipt.expectedRowCount, status: receipt.status })}\n`)).catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
