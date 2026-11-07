#!/usr/bin/env node
import { lstat, readFile, realpath, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { contractDigest } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { assertMaskedSnapshotConfig, assertMaskedSnapshotPayload, decryptMaskedSnapshot } from './lib/dev128-masked-local-snapshot.mjs'
import { assertSnapshotTargetCompatible, buildImportOrder, insertSnapshotTableRows, parseLosslessJson, tableContentSha256, transformSnapshotRows } from './lib/dev128-local-snapshot-import.mjs'
import { readDatabaseCatalog } from './dev128-masked-local-snapshot-runner.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = 'C:\\VIBE CODING\\.local\\AI_PDM\\test-admin-1020-masked-snapshot'
const SANDBOX_ROOT = path.join(ROOT, 'sandbox')
const CONTROL = path.join(SANDBOX_ROOT, 'control')
const CONFIG = assertMaskedSnapshotConfig(JSON.parse(await readFile(path.join(HERE, '..', 'config/release/dev128-masked-local-production-snapshot.json'), 'utf8')))
const TRANSFER = path.join(ROOT, 'transfer', 'snapshot.encrypted.json')
const PRIVATE_KEY = path.join(CONTROL, 'dev128-recipient-private-key.pem')
const KEY_METADATA = path.join(CONTROL, 'dev128-recipient-key.json')
const RECEIPT_DIRECTORY = path.join(CONTROL, 'imports')
const SNAPSHOT_ID = /^PDM-MASKED-[0-9]{8}-[0-9]{1,12}$/u
const { Client } = pg

function fail(code) { const error = new Error(code); error.code = code; throw error }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value ?? '')) fail('DEV128_IDENTIFIER_INVALID'); return `"${value}"` }
function quoteLiteral(value) { return `'${String(value).replaceAll("'", "''")}'` }
function key(value) { return canonicalize(value) }

async function assertRegularFile(filePath, expectedParent) {
  const parent = path.resolve(expectedParent)
  const target = path.resolve(filePath)
  if (!target.startsWith(`${parent}${path.sep}`)) fail('DEV128_LOCAL_PATH_INVALID')
  let stat, actual
  try { [stat, actual] = await Promise.all([lstat(target), realpath(target)]) } catch { fail('DEV128_LOCAL_FILE_MISSING') }
  if (!stat.isFile() || stat.isSymbolicLink() || path.resolve(actual) !== target || stat.size < 1) fail('DEV128_LOCAL_FILE_INVALID')
  return stat
}

async function readLocalTarget() {
  for (const item of [ROOT, SANDBOX_ROOT, CONTROL]) {
    let value
    try { value = await lstat(item) } catch { fail('DEV128_LOCAL_TARGET_NOT_PREPARED') }
    if (!value.isDirectory() || value.isSymbolicLink()) fail('DEV128_LOCAL_TARGET_INVALID')
  }
  const profilePath = path.join(CONTROL, 'ai-pdm-runtime.json')
  await assertRegularFile(profilePath, CONTROL)
  await assertRegularFile(path.join(CONTROL, 'owner-connection.json'), CONTROL)
  const profile = JSON.parse(await readFile(profilePath, 'utf8'))
  const owner = JSON.parse(await readFile(path.join(CONTROL, 'owner-connection.json'), 'utf8'))
  const expectedDatabase = 'jenfu_local_pdm_test_admin_1020_masked_snapshot'
  if (profile.applicationId !== 'ai-pdm' || profile.sandboxId !== 'pdm-test-admin-1020-masked-snapshot' ||
      path.resolve(profile.sandboxRoot).toLowerCase() !== path.resolve(SANDBOX_ROOT).toLowerCase() ||
      profile.origin !== 'http://localhost:1020' || profile.bindHost !== '127.0.0.1' || profile.runtimeRole !== 'pdm_test_admin_runtime_1020' ||
      owner.host !== '127.0.0.1' || Number(owner.port) !== CONFIG.localTarget.databasePort || owner.user !== 'postgres' || owner.database !== expectedDatabase ||
      owner.password?.length < 32) fail('DEV128_LOCAL_TARGET_BINDING_INVALID')
  const runtime = new URL(profile.databaseUrl)
  if (runtime.hostname !== '127.0.0.1' || Number(runtime.port) !== CONFIG.localTarget.databasePort || runtime.pathname !== `/${expectedDatabase}` ||
      runtime.username !== profile.runtimeRole || runtime.password.length < 32) fail('DEV128_LOCAL_RUNTIME_BINDING_INVALID')
  return { profile, owner, profilePath, expectedDatabase }
}

async function connectOwner(owner, database = owner.database) {
  const client = new Client({ host: owner.host, port: Number(owner.port), database, user: owner.user, password: owner.password,
    ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 30_000, application_name: 'ai-pdm-dev128-masked-snapshot-import' })
  await client.connect()
  return client
}

async function assertTargetMetadata(client, profile, expectedDatabase) {
  const result = await client.query(`SELECT target.*, current_database() AS current_database,
    host(inet_server_addr()) AS server_address, pg_catalog.shobj_description(db.oid,'pg_database') AS marker
    FROM ai_pdm_core.local_sandbox_target_metadata target
    JOIN pg_catalog.pg_database db ON db.datname=current_database()
    WHERE target.application_id='ai-pdm' AND target.sandbox_id=$1`, [profile.sandboxId])
  if (result.rows.length !== 1) fail('DEV128_LOCAL_TARGET_METADATA_INVALID')
  const target = result.rows[0]
  const expected = { applicationId: 'ai-pdm', sandboxId: profile.sandboxId, databaseName: expectedDatabase,
    sandboxRoot: SANDBOX_ROOT, dataDirectory: path.join(SANDBOX_ROOT, 'data'), repositoryDirectory: path.join(SANDBOX_ROOT, 'repository'),
    generation: target.generation, fixtureVersion: profile.fixture.version, fixtureHash: profile.fixture.hash,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2' }
  const fingerprint = contractDigest(expected)
  if (target.current_database !== expectedDatabase || target.database_name !== expectedDatabase || target.status !== 'ready' ||
      target.server_address !== '127.0.0.1' || target.sandbox_root !== expected.sandboxRoot || target.data_directory !== expected.dataDirectory ||
      target.repository_directory !== expected.repositoryDirectory || target.fixture_version !== expected.fixtureVersion ||
      target.fixture_hash !== expected.fixtureHash || target.native_session_contract_version !== expected.nativeSessionContractVersion ||
      target.target_fingerprint !== fingerprint || target.marker !== `jenfu.local-principal-bootstrap.v1:${profile.sandboxId}:${target.generation}`) fail('DEV128_LOCAL_TARGET_FINGERPRINT_MISMATCH')
  const role = (await client.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1`, [profile.runtimeRole])).rows[0]
  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolbypassrls || !role.rolcanlogin ||
      (await client.query(`SELECT pg_catalog.pg_has_role($1,'jenfu_ai_pdm_migrator','MEMBER') AS member`, [profile.runtimeRole])).rows[0].member) fail('DEV128_LOCAL_RUNTIME_ROLE_INVALID')
  return { targetFingerprint: fingerprint, generation: target.generation }
}

async function readRows(database, schema, table) {
  if (!table.primaryKey.length) fail('DEV128_MIGRATION_BASELINE_PRIMARY_KEY_MISSING')
  const projection = table.columns.map((column) => quoteIdentifier(column.name)).join(',')
  const order = table.primaryKey.map(quoteIdentifier).join(',')
  const result = await database.query(`SELECT row_to_json(row_data)::text AS row_text FROM (SELECT ${projection} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table.name)} ORDER BY ${order}) row_data`)
  return result.rows.map((row) => parseLosslessJson(row.row_text))
}

async function migrationBaseline(database, catalog) {
  const names = ['pdm_local_data_migrations', 'pdm_schema_migrations', 'schema_migrations', 'local_test_admin_install_receipts']
  const tables = new Map(catalog.tables.map((table) => [table.name, table]))
  const baseline = []
  for (const name of names) {
    const table = tables.get(name)
    if (!table) continue
    if (table.rowCount > 0 && !table.primaryKey.length) fail('DEV128_MIGRATION_BASELINE_PRIMARY_KEY_MISSING')
    const rows = table.rowCount === 0 ? [] : await readRows(database, CONFIG.localTarget.schema, table)
    baseline.push({ name, rowCount: rows.length, sha256: sha256(canonicalize(rows)) })
  }
  return baseline
}

async function triggerFingerprint(database) {
  const result = await database.query(`SELECT table_class.relname AS table_name,tg.tgname AS trigger_name,
    tg.tgenabled AS enabled,pg_catalog.pg_get_triggerdef(tg.oid,true) AS definition
    FROM pg_catalog.pg_trigger tg JOIN pg_catalog.pg_class table_class ON table_class.oid=tg.tgrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=table_class.relnamespace
    WHERE namespace.nspname=$1 AND NOT tg.tgisinternal ORDER BY table_class.relname,tg.tgname`, [CONFIG.localTarget.schema])
  return { count: result.rows.length, sha256: sha256(canonicalize(result.rows)) }
}

async function unvalidatedConstraintInventory(database) {
  const result = await database.query(`SELECT relation.relname AS table_name,constraint_value.conname AS constraint_name
    FROM pg_catalog.pg_constraint constraint_value JOIN pg_catalog.pg_class relation ON relation.oid=constraint_value.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname=$1 AND constraint_value.contype='f' AND NOT constraint_value.convalidated
    ORDER BY relation.relname,constraint_value.conname`, [CONFIG.localTarget.schema])
  return result.rows
}

async function verifyForeignKeys(database, catalog) {
  for (const fk of catalog.foreignKeys) {
    const child = quoteIdentifier(fk.childTable); const parent = quoteIdentifier(fk.parentTable)
    const childColumns = fk.childColumns.map(quoteIdentifier); const parentColumns = fk.parentColumns.map(quoteIdentifier)
    const hasValue = childColumns.map((column) => `child.${column} IS NOT NULL`).join(' AND ')
    const matches = childColumns.map((column, index) => `parent.${parentColumns[index]}=child.${column}`).join(' AND ')
    const result = await database.query(`SELECT EXISTS(SELECT 1 FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${child} child
      WHERE ${hasValue} AND NOT EXISTS(SELECT 1 FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${parent} parent WHERE ${matches})) AS has_orphan`)
    if (result.rows[0].has_orphan) fail('DEV128_LOCAL_FOREIGN_KEY_CHECK_FAILED')
  }
  return catalog.foreignKeys.length
}

async function deleteSelectedRows(database, catalog, outputNames) {
  const selected = [...new Set([...outputNames, ...CONFIG.localTarget.clearOnImportTables])]
  const tableNames = new Set(catalog.tables.map((table) => table.name))
  if (selected.some((name) => !tableNames.has(name))) fail('DEV128_LOCAL_CLEAR_TABLE_MISSING')
  const order = buildImportOrder({ tableNames: selected, foreignKeys: catalog.foreignKeys })
  for (const name of order.reverse()) {
    if (name === 'companies') await database.query(`DELETE FROM ai_pdm_core.companies WHERE id <> $1`, ['company-jenfu'])
    else if (name === 'users') await database.query(`DELETE FROM ai_pdm_core.users WHERE id <> $1`, ['pdm-local-test-admin-user'])
    else if (name === 'principal_accounts') await database.query(`DELETE FROM ai_pdm_core.principal_accounts WHERE principal_id <> $1`, ['pdm-local-test-admin'])
    else if (name === 'principal_role_assignments') await database.query(`DELETE FROM ai_pdm_core.principal_role_assignments WHERE principal_id <> $1`, ['pdm-local-test-admin'])
    else if (name === 'user_company_memberships') await database.query(`DELETE FROM ai_pdm_core.user_company_memberships WHERE user_id <> $1`, ['pdm-local-test-admin-user'])
    else if (name === 'user_role_assignments') await database.query(`DELETE FROM ai_pdm_core.user_role_assignments WHERE user_id <> $1`, ['pdm-local-test-admin-user'])
    else await database.query(`DELETE FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${quoteIdentifier(name)}`)
  }
}

async function syncSequences(database, catalog, tableNames) {
  const tables = new Map(catalog.tables.map((table) => [table.name, table]))
  for (const tableName of tableNames) {
    const table = tables.get(tableName)
    for (const column of table.columns) {
      if (!/\b(?:smallint|integer|bigint)\b/iu.test(column.type)) continue
      const qualifiedName = `${CONFIG.localTarget.schema}.${tableName}`
      const sequence = (await database.query(`SELECT sequence_ns.nspname AS schema_name, sequence.relname AS sequence_name
        FROM pg_catalog.pg_class sequence
        JOIN pg_catalog.pg_namespace sequence_ns ON sequence_ns.oid=sequence.relnamespace
        WHERE sequence.oid=pg_catalog.pg_get_serial_sequence($1,$2)::regclass`, [qualifiedName, column.name])).rows[0]
      if (!sequence) continue
      const maximum = (await database.query(`SELECT MAX(${quoteIdentifier(column.name)})::text AS maximum
        FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${quoteIdentifier(tableName)}`)).rows[0].maximum
      if (maximum !== null && !/^-?[0-9]+$/u.test(maximum)) fail('DEV128_SEQUENCE_VALUE_INVALID')
      const next = maximum === null ? 1n : BigInt(maximum) + 1n
      await database.query(`ALTER SEQUENCE ${quoteIdentifier(sequence.schema_name)}.${quoteIdentifier(sequence.sequence_name)} RESTART WITH ${next.toString()}`)
    }
  }
}

async function assertLocalTestAdmin(client, profile, targetInfo) {
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  try { await client.query('SELECT ai_pdm_core.ensure_local_test_admin_v1($1,$2,$3,$4)', [profile.sandboxId, targetInfo.generation, profile.fixture.hash, targetInfo.targetFingerprint]) }
  finally { await client.query('RESET ROLE') }
  const user = (await client.query(`SELECT count(*)::integer AS count FROM ai_pdm_core.users
    WHERE id='pdm-local-test-admin-user' AND company_id='company-jenfu' AND role='Admin' AND account_status='active' AND system_role_enabled=1 AND password_hash IS NULL`)).rows[0]
  const account = (await client.query(`SELECT count(*)::integer AS count FROM ai_pdm_core.principal_accounts
    WHERE principal_id='pdm-local-test-admin' AND pdm_user_id='pdm-local-test-admin-user' AND company_id='company-jenfu'
      AND account_status='active' AND system_role_enabled=true`)).rows[0]
  if (user.count !== 1 || account.count !== 1) fail('DEV128_LOCAL_TEST_ADMIN_READBACK_FAILED')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 0) fail('DEV128_IMPORT_ARGUMENTS_INVALID')
  const snapshotArtifact = await assertRegularFile(TRANSFER, ROOT)
  if (snapshotArtifact.size > CONFIG.source.maxEncryptedBytes) fail('DEV128_ENCRYPTED_SIZE_LIMIT_EXCEEDED')
  let envelopeHeader
  try { envelopeHeader = JSON.parse(await readFile(TRANSFER, 'utf8')) }
  catch { fail('DEV128_ENVELOPE_INVALID') }
  if (!SNAPSHOT_ID.test(envelopeHeader?.snapshotId ?? '')) fail('DEV128_ENVELOPE_INVALID')
  const alreadyImported = await lstat(path.join(RECEIPT_DIRECTORY, `${envelopeHeader.snapshotId}.json`)).then(
    () => true,
    (error) => {
      if (error?.code === 'ENOENT') return false
      throw error
    }
  )
  if (alreadyImported) fail('DEV128_SNAPSHOT_ALREADY_IMPORTED')
  await assertRegularFile(PRIVATE_KEY, CONTROL)
  await assertRegularFile(KEY_METADATA, CONTROL)
  const keyMetadata = JSON.parse(await readFile(KEY_METADATA, 'utf8'))
  if (keyMetadata.schemaVersion !== 'jenfu.dev128.local-recipient-key.v1' || !/^[a-f0-9]{64}$/u.test(keyMetadata.keyId ?? '')) fail('DEV128_RECIPIENT_KEY_METADATA_INVALID')
  const encryptedBytes = await readFile(TRANSFER)
  const ciphertextSha256 = sha256(encryptedBytes)
  const privateKeyBytes = await readFile(PRIVATE_KEY)
  let payload
  try {
    payload = decryptMaskedSnapshot({ bytes: encryptedBytes, privateKeyPem: privateKeyBytes.toString('utf8'), expectedKeyId: keyMetadata.keyId,
      maxEncryptedBytes: CONFIG.source.maxEncryptedBytes, maxUncompressedBytes: CONFIG.source.maxUncompressedBytes })
  } finally { privateKeyBytes.fill(0) }
  assertMaskedSnapshotPayload({ config: CONFIG, payload })
  if (keyMetadata.snapshotId && keyMetadata.snapshotId !== payload.snapshotId) fail('DEV128_RECIPIENT_SNAPSHOT_MISMATCH')

  const { profile, owner, expectedDatabase } = await readLocalTarget()
  const client = await connectOwner(owner)
  let committed = false
  let receiptPath
  try {
    const targetInfo = await assertTargetMetadata(client, profile, expectedDatabase)
    const preImportCatalog = await readDatabaseCatalog(client, CONFIG.localTarget.schema)
    const compatibility = assertSnapshotTargetCompatible({ payload, targetCatalog: preImportCatalog })
    const migrationBefore = await migrationBaseline(client, preImportCatalog)
    const triggersBefore = await triggerFingerprint(client)
    const unvalidatedBefore = await unvalidatedConstraintInventory(client)
    const outputNames = compatibility.outputNames
    const sourceRows = payload.tables.reduce((sum, table) => sum + table.rowCount, 0)
    const testAdminBefore = (await client.query(`SELECT
      (SELECT count(*)::integer FROM ai_pdm_core.users WHERE id='pdm-local-test-admin-user') AS users,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts WHERE principal_id='pdm-local-test-admin') AS accounts`)).rows[0]
    if (testAdminBefore.users !== 1 || testAdminBefore.accounts !== 1) fail('DEV128_LOCAL_TEST_ADMIN_BASELINE_INVALID')

    const dataTableSet = new Set(outputNames)
    const triggerDependencies = (await import('./lib/dev012-production-data-cutover.mjs')).REQUIRED_TRIGGER_DEPENDENCIES
    const orderedTables = buildImportOrder({ tableNames: outputNames, foreignKeys: payload.source.catalog.foreignKeys, triggerDependencies })
    const targetTables = new Map(preImportCatalog.tables.map((table) => [table.name, table]))
    const payloadTables = new Map(payload.tables.map((table) => [table.name, table]))

    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await client.query("SET LOCAL lock_timeout='5s'")
    await client.query("SET LOCAL statement_timeout='180s'")
    await client.query("SET LOCAL idle_in_transaction_session_timeout='180s'")
    await client.query('SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1),pg_catalog.hashtext(current_database()))', ['dev128-ai-pdm-masked-local-snapshot'])
    await deleteSelectedRows(client, preImportCatalog, outputNames)

    let upsertedRows = 0
    const tableReadbacks = []
    for (const name of orderedTables) {
      if (!dataTableSet.has(name)) fail('DEV128_IMPORT_ORDER_INVALID')
      const targetTable = targetTables.get(name)
      const expected = transformSnapshotRows({ payload, targetTable, cutoverConfig: {} })
      const writeRows = await insertSnapshotTableRows(client, CONFIG.localTarget.schema, targetTable, expected)
      upsertedRows += writeRows
      const observed = await readSnapshotTableRows(client, CONFIG.localTarget.schema, targetTable)
      const expectedHash = tableContentSha256(expected, targetTable.primaryKey)
      const observedHash = tableContentSha256(observed, targetTable.primaryKey)
      const sourceTable = payloadTables.get(name)
      if (observed.length !== sourceTable.rowCount || expectedHash !== observedHash) fail('DEV128_TARGET_TABLE_READBACK_MISMATCH')
      tableReadbacks.push({ name, rowCount: observed.length, contentSha256: observedHash })
    }
    for (const name of CONFIG.localTarget.clearOnImportTables) {
      const where = name === 'principal_accounts' || name === 'principal_role_assignments' ? ` WHERE principal_id <> 'pdm-local-test-admin'`
        : name === 'user_company_memberships' || name === 'user_role_assignments' ? ` WHERE user_id <> 'pdm-local-test-admin-user'`
          : ''
      const result = await client.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${quoteIdentifier(name)}${where}`)
      if (result.rows[0].count !== 0) fail('DEV128_LOCAL_SENSITIVE_TABLE_NOT_EMPTY')
    }
    for (const name of CONFIG.source.requireEmptyTables) {
      const result = await client.query(`SELECT count(*)::integer AS count FROM ${quoteIdentifier(CONFIG.localTarget.schema)}.${quoteIdentifier(name)}`)
      if (result.rows[0].count !== 0) fail('DEV128_LOCAL_STAGING_TABLE_NOT_EMPTY')
    }
    await syncSequences(client, preImportCatalog, outputNames)
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    const fkCount = await verifyForeignKeys(client, preImportCatalog)
    const migrationAfter = await migrationBaseline(client, preImportCatalog)
    const triggersAfter = await triggerFingerprint(client)
    const unvalidatedAfter = await unvalidatedConstraintInventory(client)
    if (key(migrationBefore) !== key(migrationAfter) || key(triggersBefore) !== key(triggersAfter) || key(unvalidatedBefore) !== key(unvalidatedAfter)) fail('DEV128_LOCAL_BASELINE_CHANGED')
    await assertLocalTestAdmin(client, profile, targetInfo)
    const testAdminAfter = (await client.query(`SELECT
      (SELECT count(*)::integer FROM ai_pdm_core.users WHERE id='pdm-local-test-admin-user') AS users,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts WHERE principal_id='pdm-local-test-admin') AS accounts`)).rows[0]
    if (testAdminAfter.users !== 1 || testAdminAfter.accounts !== 1) fail('DEV128_LOCAL_TEST_ADMIN_READBACK_FAILED')
    await client.query('COMMIT')
    committed = true

    const receiptCore = {
      schemaVersion: 'jenfu.dev128.masked-local-import-receipt.v1',
      snapshotId: payload.snapshotId,
      sourceRevision: payload.sourceRevision,
      sourceCatalogSha256: payload.source.catalogSha256,
      maskingPolicyVersion: payload.masking.policyVersion,
      maskingPolicySha256: payload.masking.policySha256,
      payloadSha256: payload.payloadSha256,
      ciphertextSha256,
      recipientKeyId: keyMetadata.keyId,
      targetProfile: CONFIG.localTarget.profileName,
      targetFingerprint: targetInfo.targetFingerprint,
      targetSchema: CONFIG.localTarget.schema,
      tableCount: tableReadbacks.length,
      rowCount: sourceRows,
      upsertedRows,
      foreignKeyChecks: fkCount,
      rootAndReferenceTablesSha256: sha256(canonicalize(tableReadbacks)),
      migrationBaselineSha256: sha256(canonicalize(migrationAfter)),
      triggerBaselineSha256: triggersAfter.sha256,
      unvalidatedForeignKeyCount: unvalidatedAfter.length,
      original1020TargetModified: false,
      ssoIdentityRowsImported: false,
      fileBytesImported: false,
      status: 'PASS'
    }
    const receipt = { ...receiptCore, receiptSha256: sha256(canonicalize(receiptCore)) }
    await import('node:fs/promises').then(({ mkdir }) => mkdir(RECEIPT_DIRECTORY, { recursive: true }))
    receiptPath = path.join(RECEIPT_DIRECTORY, `${payload.snapshotId}.json`)
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await unlink(TRANSFER)
    await unlink(PRIVATE_KEY)
    await writeFile(KEY_METADATA, `${JSON.stringify({ schemaVersion: 'jenfu.dev128.local-recipient-key.v1', keyId: keyMetadata.keyId, status: 'CONSUMED', snapshotId: payload.snapshotId }, null, 2)}\n`, { flag: 'w', mode: 0o600 })
    process.stdout.write(`${JSON.stringify({ status: 'PASS', snapshotId: payload.snapshotId, sourceRevision: payload.sourceRevision, tableCount: tableReadbacks.length, rowCount: sourceRows, targetProfile: CONFIG.localTarget.profileName, ssoIdentityRowsImported: false, fileBytesImported: false, receipt: receiptPath })}\n`)
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.code ?? 'DEV128_LOCAL_IMPORT_FAILED'}\n`)
  process.exitCode = 1
})
