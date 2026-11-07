#!/usr/bin/env node
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import pg from 'pg'
import { canonicalize, quoteIdentifier, sha256 } from './lib/dev012-production-data-cutover.mjs'
import {
  assertMaskedSnapshotConfig,
  assertProductionCatalogShape,
  createMaskedSnapshotPayload,
  encryptMaskedSnapshot,
  recipientKeyIdForPublicKey
} from './lib/dev128-masked-local-snapshot.mjs'

const { Client } = pg
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(HERE, '../config/release/dev128-masked-local-production-snapshot.json')
const H40 = /^[a-f0-9]{40}$/u
const SNAPSHOT_ID = /^PDM-MASKED-[0-9]{8}-[0-9]{1,12}$/u
const LOSSLESS_NUMBER_KEY = '__dev128_number_v1__'

function fail(code) { const error = new Error(code); error.code = code; throw error }

async function metadataAccessToken() {
  let response
  try {
    response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    })
  } catch { fail('DEV128_METADATA_TOKEN_UNAVAILABLE') }
  if (!response.ok) fail('DEV128_METADATA_TOKEN_UNAVAILABLE')
  const value = await response.json()
  if (typeof value.access_token !== 'string' || value.access_token.length < 20) fail('DEV128_METADATA_TOKEN_INVALID')
  return value.access_token
}

export async function readDatabaseCatalog(database, schema, { includeRowCounts = true } = {}) {
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
    const count = includeRowCounts
      ? Number((await database.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)}`)).rows[0].count)
      : 0
    resultTables.push({ name: table.name, rowCount: count, columns: columnsByTable.get(table.name) ?? [], primaryKey: primaryKeyByTable.get(table.name) ?? [] })
  }
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database: (await database.query('SELECT current_database() AS name')).rows[0].name, schema, tables: resultTables, foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--snapshot-id' || argv[2] !== '--recipient-public-key-b64' || !SNAPSHOT_ID.test(argv[1] ?? '') || !/^[A-Za-z0-9+/]+={0,2}$/u.test(argv[3] ?? '')) fail('DEV128_RUNNER_ARGUMENTS_INVALID')
  return { snapshotId: argv[1], publicKeyB64: argv[3] }
}

async function loadPublicKey(encoded) {
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64').replace(/=+$/u, '') !== encoded.replace(/=+$/u, '') || bytes.length > 4096) fail('DEV128_RECIPIENT_PUBLIC_KEY_INVALID')
  return bytes.toString('utf8')
}

function parseJsonLosslessly(jsonText) {
  if (typeof jsonText !== 'string') fail('DEV128_SOURCE_ROW_JSON_INVALID')
  let rewritten = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < jsonText.length;) {
    const character = jsonText[index]
    if (inString) {
      rewritten += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      index += 1
      continue
    }
    if (character === '"') { inString = true; rewritten += character; index += 1; continue }
    if (character === '-' || (character >= '0' && character <= '9')) {
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(jsonText.slice(index))
      if (!match) fail('DEV128_SOURCE_ROW_JSON_INVALID')
      rewritten += `{${JSON.stringify(LOSSLESS_NUMBER_KEY)}:${JSON.stringify(match[0])}}`
      index += match[0].length
      continue
    }
    rewritten += character
    index += 1
  }
  try { return JSON.parse(rewritten) } catch { fail('DEV128_SOURCE_ROW_JSON_INVALID') }
}

async function exportRows(database, config, catalog, copyTables) {
  const tableByName = new Map(catalog.tables.map((table) => [table.name, table]))
  let estimatedBytes = 0
  for (const tableName of copyTables) {
    const table = tableByName.get(tableName)
    if (!table || table.rowCount > config.source.maxRows) fail('DEV128_SOURCE_ROW_LIMIT_EXCEEDED')
    if (table.rowCount === 0) continue
    const estimate = await database.query(`SELECT coalesce(sum(pg_column_size(t)),0)::bigint::text AS bytes FROM ${quoteIdentifier(config.source.schema)}.${quoteIdentifier(tableName)} t`)
    estimatedBytes += Number(estimate.rows[0].bytes)
    if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes > config.source.maxUncompressedBytes) fail('DEV128_SOURCE_SIZE_LIMIT_EXCEEDED')
  }
  const rowsByTable = new Map()
  for (const tableName of copyTables) {
    const table = tableByName.get(tableName)
    if (!table || table.rowCount > config.source.maxRows) fail('DEV128_SOURCE_ROW_LIMIT_EXCEEDED')
    if (table.rowCount === 0) { rowsByTable.set(tableName, []); continue }
    if (table.primaryKey.length === 0) fail('DEV128_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY')
    const fileTable = config.source.fileTables.includes(tableName)
    const projection = table.columns.map((column) => {
      const lower = column.name.toLowerCase()
      const fileBytes = fileTable && (/\bbytea\b/iu.test(column.type) || /(^|_)(bytes|blob|binary|content_data|file_data|body)(_|$)/iu.test(lower))
      return fileBytes ? `NULL AS ${quoteIdentifier(column.name)}` : quoteIdentifier(column.name)
    }).join(',')
    const order = table.primaryKey.map(quoteIdentifier).join(',')
    const query = `SELECT row_to_json(source_row)::text AS row_text FROM (SELECT ${projection} FROM ${quoteIdentifier(config.source.schema)}.${quoteIdentifier(tableName)} ORDER BY ${order}) source_row`
    const result = await database.query(query)
    const rows = result.rows.map((item) => parseJsonLosslessly(item.row_text))
    if (rows.length !== table.rowCount) fail('DEV128_SOURCE_ROW_COUNT_MISMATCH')
    rowsByTable.set(tableName, rows)
  }
  return rowsByTable
}

async function uploadCiphertext({ bytes, config, snapshotId, sourceRevision, recipientKeyId, ciphertextSha256, token }) {
  const objectName = `${config.objectPrefix}/${snapshotId}/snapshot.encrypted.json`
  const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(config.releaseBucket)}/o?uploadType=multipart&ifGenerationMatch=0`
  const boundary = `dev128-${crypto.randomBytes(18).toString('hex')}`
  const metadata = Buffer.from(JSON.stringify({
    name: objectName,
    contentType: 'application/octet-stream',
    metadata: {
      'dev128-snapshot-id': snapshotId,
      'dev128-source-revision': sourceRevision,
      'dev128-recipient-key-id': recipientKeyId,
      'dev128-ciphertext-sha256': ciphertextSha256
    }
  }), 'utf8')
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(180_000)
  })
  if (response.status === 412) fail('DEV128_OUTPUT_OBJECT_ALREADY_EXISTS')
  if (!response.ok) fail('DEV128_CIPHERTEXT_UPLOAD_FAILED')
  const value = await response.json()
  if (!/^[1-9][0-9]*$/u.test(String(value.generation ?? '')) || Number(value.size) !== bytes.length || value.name !== objectName ||
      value.metadata?.['dev128-snapshot-id'] !== snapshotId ||
      value.metadata?.['dev128-source-revision'] !== sourceRevision ||
      value.metadata?.['dev128-recipient-key-id'] !== recipientKeyId ||
      value.metadata?.['dev128-ciphertext-sha256'] !== ciphertextSha256) fail('DEV128_CIPHERTEXT_UPLOAD_READBACK_INVALID')
  return { objectName, generation: String(value.generation), size: bytes.length }
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const { snapshotId, publicKeyB64 } = parseArgs(argv)
  const config = assertMaskedSnapshotConfig(JSON.parse(await readFile(CONFIG_PATH, 'utf8')))
  const revision = environment.PDM_SOURCE_REVISION
  if (!H40.test(revision ?? '') || environment.DEV128_DATABASE !== config.source.database || environment.DEV128_DATABASE_LOGIN !== config.source.databaseLogin || environment.DEV128_INSTANCE_CONNECTION_NAME !== config.source.instanceConnectionName || environment.DEV128_DATABASE_HOST !== `/cloudsql/${config.source.instanceConnectionName}` || environment.DEV128_PROJECT_ID !== config.source.projectId) fail('DEV128_SOURCE_BINDING_INVALID')
  const publicKeyPem = await loadPublicKey(publicKeyB64)
  const recipientKeyId = recipientKeyIdForPublicKey(publicKeyPem)
  if (recipientKeyId !== environment.DEV128_RECIPIENT_KEY_ID || environment.DEV128_CATALOG_SHAPE_SHA256 !== config.source.catalogShapeSha256) fail('DEV128_OWNER_BINDING_INVALID')
  const startsAt = Date.parse(environment.DEV128_STARTS_AT ?? '')
  const expiresAt = Date.parse(environment.DEV128_EXPIRES_AT ?? '')
  const now = Date.now()
  if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt) || startsAt >= expiresAt || expiresAt - startsAt > 7_200_000 || now < startsAt || now >= expiresAt) fail('DEV128_OWNER_WINDOW_INVALID')
  const shapePath = path.resolve(HERE, '..', config.source.catalogShapePath)
  const shape = JSON.parse(await readFile(shapePath, 'utf8'))
  const token = await metadataAccessToken()
  const database = new Client({
    host: environment.DEV128_DATABASE_HOST,
    database: config.source.database,
    user: config.source.databaseLogin,
    password: token,
    ssl: false,
    application_name: `dev128-masked-snapshot-${snapshotId}`,
    connectionTimeoutMillis: 20_000,
    query_timeout: 180_000,
    statement_timeout: 180_000
  })
  let transaction = false
  try {
    await database.connect()
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transaction = true
    await database.query("SET LOCAL statement_timeout = '180s'")
    await database.query("SET LOCAL idle_in_transaction_session_timeout = '180s'")
    await database.query("SET LOCAL lock_timeout = '5s'")
    const session = (await database.query(`SELECT current_setting('transaction_read_only') AS read_only,
      current_user AS current_user, role.rolsuper AS superuser
      FROM pg_catalog.pg_roles role WHERE role.rolname=current_user`)).rows[0]
    if (session?.read_only !== 'on' || session?.current_user !== config.source.databaseLogin || session?.superuser !== false) fail('DEV128_READ_ONLY_SESSION_INVALID')
    const structuralCatalog = await readDatabaseCatalog(database, config.source.schema, { includeRowCounts: false })
    assertProductionCatalogShape({ catalog: structuralCatalog, shape, expectedSha256: config.source.catalogShapeSha256 })
    const catalog = await readDatabaseCatalog(database, config.source.schema)
    if (catalog.database !== config.source.database || catalog.schema !== config.source.schema || catalog.tables.length !== config.source.expectedTableCount) fail('DEV128_SOURCE_CATALOG_BINDING_INVALID')
    const requireEmpty = new Set(config.source.requireEmptyTables)
    for (const tableName of requireEmpty) {
      const table = catalog.tables.find((item) => item.name === tableName)
      if (!table || table.rowCount !== 0) fail('DEV128_REQUIRED_EMPTY_TABLE_NOT_EMPTY')
    }
    const excluded = new Set([...config.source.requireEmptyTables, ...config.source.excludedTables])
    const copyTables = catalog.tables.filter((table) => !excluded.has(table.name)).map((table) => table.name).sort()
    if (copyTables.length !== config.source.expectedCopyTableCount) fail('DEV128_COPY_TABLE_COUNT_DRIFT')
    const outputTables = copyTables.filter((tableName) => !config.source.skipTables.includes(tableName))
    if (outputTables.length !== copyTables.length - config.source.skipTables.length) fail('DEV128_OUTPUT_TABLE_COUNT_DRIFT')
    const totalRows = outputTables.reduce((sum, name) => sum + catalog.tables.find((table) => table.name === name).rowCount, 0)
    if (totalRows > config.source.maxRows) fail('DEV128_ROW_LIMIT_EXCEEDED')
    const rowsByTable = await exportRows(database, config, catalog, outputTables)
    await database.query('COMMIT')
    transaction = false
    const { payload, scan } = createMaskedSnapshotPayload({ config, snapshotId, sourceRevision: revision, sourceCatalog: catalog, rowsByTable })
    const encrypted = encryptMaskedSnapshot({ payload, publicKeyPem, maxEncryptedBytes: config.source.maxEncryptedBytes })
    if (encrypted.keyId !== recipientKeyId) fail('DEV128_RECIPIENT_KEY_MISMATCH')
    const object = await uploadCiphertext({
      bytes: encrypted.bytes,
      config,
      snapshotId,
      sourceRevision: revision,
      recipientKeyId,
      ciphertextSha256: encrypted.ciphertextSha256,
      token
    })
    const receiptCore = {
      schemaVersion: 'jenfu.dev128.mini-export-receipt.v1',
      ownerApplicationId: 'ai-pdm',
      snapshotId,
      sourceRevision: revision,
      sourceCatalogSha256: catalog.catalogSha256,
      maskingPolicyVersion: config.masking.policyVersion,
      maskingPolicySha256: payload.masking.policySha256,
      payloadSha256: payload.payloadSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
      recipientKeyId: encrypted.keyId,
      tableCount: payload.source.copiedTableCount,
      skippedTableCount: payload.source.skippedTableCount,
      rowCount: payload.source.rowCount,
      serializedBytes: scan.serializedBytes,
      encryptedBytes: encrypted.encryptedBytes,
      objectName: object.objectName,
      objectGeneration: object.generation,
      status: 'MASKED_ENCRYPTED'
    }
    process.stdout.write(`${JSON.stringify({ ...receiptCore, receiptSha256: sha256(canonicalize(receiptCore)) })}\n`)
  } catch (error) {
    if (transaction) await database.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await database.end().catch(() => undefined)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.code ?? 'DEV128_RUNNER_FAILED'}\n`)
    process.exitCode = 1
  })
}

export { main as runMaskedSnapshotExport, parseJsonLosslessly }
