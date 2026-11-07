#!/usr/bin/env node
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, lstat, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import { lstatSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { contractDigest } from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { assertMaskedSnapshotConfig } from './lib/dev128-masked-local-snapshot.mjs'
import { buildImportOrder } from './lib/dev128-local-snapshot-import.mjs'
import { readDatabaseCatalog } from './dev128-masked-local-snapshot-runner.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONFIG = assertMaskedSnapshotConfig(JSON.parse(await readFile(path.join(HERE, '..', 'config/release/dev128-masked-local-production-snapshot.json'), 'utf8')))
const ROOT = CONFIG.localTarget.runtimeRoot
const SANDBOX_ROOT = path.join(ROOT, 'sandbox')
const CONTROL = path.join(SANDBOX_ROOT, 'control')
const OLD_ROOT = path.join(path.dirname(ROOT), 'test-admin-1020')
const OLD_SANDBOX = path.join(OLD_ROOT, 'sandbox')
const OLD_CONTROL = path.join(OLD_SANDBOX, 'control')
const OLD_PROFILE_PATH = path.join(OLD_CONTROL, 'ai-pdm-runtime.json')
const OLD_OWNER_PATH = path.join(OLD_CONTROL, 'owner-connection.json')
const TARGET_DATABASE = 'jenfu_local_pdm_test_admin_1020_masked_snapshot'
const RUNTIME_ROLE = 'pdm_test_admin_runtime_1020'
const PG_BIN = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PostgreSQL', '18', 'bin')
const PGDATA = path.join(ROOT, 'postgres', 'data')
const PG_LOG = path.join(ROOT, 'postgres', 'postgres.log')
const PG_CTL = path.join(PG_BIN, 'pg_ctl.exe')
const INITDB = path.join(PG_BIN, 'initdb.exe')
const PG_DUMP = path.join(PG_BIN, 'pg_dump.exe')
const PG_RESTORE = path.join(PG_BIN, 'pg_restore.exe')
const TARGET_PORT = CONFIG.localTarget.databasePort
const { Client } = pg
let taskRootCreated = false
let postgresStarted = false

function fail(code) { const error = new Error(code); error.code = code; throw error }
function q(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value ?? '')) fail('DEV128_IDENTIFIER_INVALID'); return `"${value}"` }
function lit(value) { return `'${String(value).replaceAll("'", "''")}'` }

function runSync(file, args, options = {}) {
  const result = spawnSync(file, args, { windowsHide: true, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, ...options })
  if (result.error || result.status !== 0) fail(options.failureCode ?? 'DEV128_LOCAL_PREP_COMMAND_FAILED')
  return result.stdout ?? ''
}

function safeBaseEnv(extra = {}) {
  const env = { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? 'C:\\Windows', TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp', ...extra }
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  return env
}

function pgEnv(connection) {
  return safeBaseEnv({ PGHOST: connection.host, PGPORT: String(connection.port), PGUSER: connection.user,
    PGDATABASE: connection.database, PGPASSWORD: connection.password, PGAPPNAME: 'ai-pdm-dev128-local-snapshot' })
}

async function runChild(file, args, { cwd = HERE, env = safeBaseEnv(), failureCode = 'DEV128_LOCAL_PREP_COMMAND_FAILED', timeoutMs = 120_000 } = {}) {
  const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const completion = new Promise((resolve, reject) => {
    let settled = false
    let poll
    const complete = (code, signal) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      resolve({ code, signal })
    }
    const failed = (error) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      reject(error)
    }
    child.once('error', failed)
    child.once('exit', complete)
    child.once('close', complete)
    poll = setInterval(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        complete(child.exitCode, child.signalCode)
      }
    }, 25)
    if (settled) clearInterval(poll)
  })
  let stdoutBytes = 0; let stderrBytes = 0; let stdout = ''; let stderr = ''
  child.stdout.on('data', (chunk) => { stdoutBytes += chunk.length; if (stdoutBytes <= 64 * 1024) stdout += chunk.toString('utf8'); else child.kill() })
  child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; if (stderrBytes <= 64 * 1024) stderr += chunk.toString('utf8'); else child.kill() })
  const timer = setTimeout(() => child.kill(), timeoutMs)
  const exit = await completion
  clearTimeout(timer)
  if (exit.code !== 0) fail(failureCode)
  return { stdout, stderr }
}

async function setTaskRootAcl(root) {
  const who = runSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { failureCode: 'DEV128_LOCAL_ACL_IDENTITY_UNAVAILABLE' })
  const sid = /S-1-[0-9-]+/u.exec(who)?.[0]
  if (!sid) fail('DEV128_LOCAL_ACL_IDENTITY_UNAVAILABLE')
  runSync('icacls.exe', [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { failureCode: 'DEV128_LOCAL_ACL_SETUP_FAILED' })
}

async function ensurePortFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', () => reject(Object.assign(new Error('PORT_OCCUPIED'), { code: 'DEV128_LOCAL_DATABASE_PORT_OCCUPIED' })))
    server.listen(port, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolve()))
  })
}

function assertNoLinks(paths) {
  for (const candidate of paths) {
    let current = path.resolve(candidate)
    while (current.length > 3) {
      try { if (lstatSync(current).isSymbolicLink()) fail('DEV128_LOCAL_PATH_LINK_FORBIDDEN') }
      catch (error) { if (error?.code !== 'ENOENT') throw error }
      current = path.dirname(current)
    }
  }
}

async function connect(connection, database = connection.database, applicationName) {
  const client = new Client({ host: connection.host, port: Number(connection.port), database, user: connection.user,
    password: connection.password, ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 30_000,
    application_name: applicationName ?? 'ai-pdm-dev128-local-snapshot-prepare' })
  await client.connect()
  return client
}

async function readPdmAclRoles(client) {
  const result = await client.query(`SELECT DISTINCT pg_catalog.pg_get_userbyid(role_oid) AS role_name FROM (
    SELECT namespace.nspowner AS role_oid FROM pg_catalog.pg_namespace namespace WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract')
    UNION ALL SELECT relation.relowner FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract')
    UNION ALL SELECT procedure.proowner FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract') AND procedure.prokind='f'
    UNION ALL SELECT acl.grantee FROM pg_catalog.pg_namespace namespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(namespace.nspacl,pg_catalog.acldefault('n',namespace.nspowner))) acl
      WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract')
    UNION ALL SELECT acl.grantee FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
      WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract') AND procedure.prokind='f'
    UNION ALL SELECT acl.grantee FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault(CASE WHEN relation.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,relation.relowner))) acl
      WHERE namespace.nspname IN ('ai_pdm_core','ai_pdm_contract')
  ) referenced WHERE role_oid<>0 ORDER BY 1`)
  const allowed = new Set(['jenfu_ai_pdm_migrator','jenfu_ai_pdm_runtime','jenfu_orgmaster_migrator','jenfu_orgmaster_runtime','jenfu_r1_verifier','pdm_test_admin_runtime_1020','postgres'])
  const roles = [...new Set(result.rows.map((row) => row.role_name).filter((name) => name !== 'postgres' && name !== RUNTIME_ROLE))].sort()
  if (roles.some((name) => !allowed.has(name))) fail('DEV128_LOCAL_ROLE_REFERENCE_DRIFT')
  return roles
}

async function readLocalSourceSnapshot(source) {
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await source.query("SET LOCAL statement_timeout='180s'")
  await source.query("SET LOCAL lock_timeout='5s'")
  const identity = (await source.query('SELECT current_database() AS database,host(inet_server_addr()) AS address,inet_server_port() AS port')).rows[0]
  if (identity.database !== 'jenfu_local_pdm_test_admin_1020' || identity.address !== '127.0.0.1' || Number(identity.port) !== 58420) fail('DEV128_LOCAL_SOURCE_BINDING_INVALID')
  const schemas = (await source.query(`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname`)).rows.map((row) => row.nspname)
  if (!schemas.includes('ai_pdm_core') || !schemas.includes('ai_pdm_contract')) fail('DEV128_LOCAL_SOURCE_PDM_SCHEMA_MISSING')
  const sourceCatalog = await readDatabaseCatalog(source, 'ai_pdm_core')
  let verifiedForeignKeys = 0
  for (const fk of sourceCatalog.foreignKeys) {
    const childColumns = fk.childColumns.map(q)
    const parentColumns = fk.parentColumns.map(q)
    const hasValue = childColumns.map((column) => `child.${column} IS NOT NULL`).join(' AND ')
    const matches = childColumns.map((column, index) => `parent.${parentColumns[index]}=child.${column}`).join(' AND ')
    const orphan = (await source.query(`SELECT EXISTS(SELECT 1 FROM ai_pdm_core.${q(fk.childTable)} child
      WHERE ${hasValue} AND NOT EXISTS(SELECT 1 FROM ai_pdm_core.${q(fk.parentTable)} parent WHERE ${matches})) AS present`)).rows[0].present
    if (orphan) fail('DEV128_LOCAL_SOURCE_FOREIGN_KEY_INVALID')
    verifiedForeignKeys += 1
  }
  const masters = (await source.query(`SELECT
    (SELECT count(*)::integer FROM ai_pdm_core.companies) AS companies,
    (SELECT count(*)::integer FROM ai_pdm_core.part_roots) AS roots,
    (SELECT count(*)::integer FROM ai_pdm_core.part_numbers) AS part_numbers,
    (SELECT count(*)::integer FROM ai_pdm_core.drawing_numbers) AS drawing_numbers,
    (SELECT count(*)::integer FROM ai_pdm_core.drawings) AS drawings`)).rows[0]
  if (masters.companies !== 1 || Object.values(masters).some((value) => !Number.isInteger(value) || value < 0)) fail('DEV128_LOCAL_SOURCE_MASTER_INVARIANT_INVALID')
  const migrationRows = (await source.query(`SELECT row_to_json(migration)::text AS row_text
    FROM ai_pdm_core.schema_migrations migration ORDER BY migration.version`)).rows.map((row) => row.row_text)
  const migrationSha256 = sha256(canonicalize(migrationRows))
  const excludedData = new Set([...CONFIG.localTarget.clearOnImportTables, ...CONFIG.source.fileTables])
  const sourceCounts = sourceCatalog.tables.map((table) => ({ name: table.name, rowCount: table.rowCount,
    excludedFromLocalClone: excludedData.has(table.name) })).sort((a, b) => a.name.localeCompare(b.name))
  const schemaHash = sha256(canonicalize({ columns: sourceCatalog.tables.map(({ rowCount: _count, ...item }) => item), foreignKeys: sourceCatalog.foreignKeys }))
  const snapshotId = (await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot
  const roles = await readPdmAclRoles(source)
  const membership = (await source.query(`SELECT member.rolname AS member_role,granted.rolname AS granted_role FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
    WHERE member.rolname='pdm_test_admin_runtime_1020' ORDER BY 1,2`)).rows
  if (canonicalize(membership) !== canonicalize([{ member_role: 'pdm_test_admin_runtime_1020', granted_role: 'jenfu_ai_pdm_runtime' }])) fail('DEV128_LOCAL_RUNTIME_MEMBERSHIP_DRIFT')
  return { sourceCatalog, sourceCounts, schemaHash, snapshotId, roles, verifiedForeignKeys, masters, migrationSha256 }
}

async function pipeDumpToRestore({ sourceOwner, targetOwner, snapshotId }) {
  const excluded = new Set([...CONFIG.localTarget.clearOnImportTables, ...CONFIG.source.fileTables])
  const dumpArgs = ['--no-password','--format=custom','--compress=6','--schema=ai_pdm_core','--schema=ai_pdm_contract',
    '--snapshot',snapshotId,'--host',sourceOwner.host,'--port',String(sourceOwner.port),'--username',sourceOwner.user,'--dbname',sourceOwner.database]
  for (const table of [...excluded].sort()) dumpArgs.push(`--exclude-table-data=ai_pdm_core.${table}`)
  const restoreArgs = ['--no-password','--exit-on-error','--single-transaction','--host',targetOwner.host,'--port',String(targetOwner.port),
    '--username',targetOwner.user,'--dbname',targetOwner.database]
  const dump = spawn(PG_DUMP, dumpArgs, { cwd: HERE, env: pgEnv(sourceOwner), windowsHide: true, stdio: ['ignore','pipe','pipe'] })
  const restore = spawn(PG_RESTORE, restoreArgs, { cwd: HERE, env: pgEnv(targetOwner), windowsHide: true, stdio: ['pipe','ignore','pipe'] })
  const wait = (child) => new Promise((resolve, reject) => {
    let settled = false
    let poll
    const complete = (code, signal) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      resolve({ code, signal })
    }
    const failed = (error) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      reject(error)
    }
    child.once('error', failed)
    child.once('exit', complete)
    child.once('close', complete)
    poll = setInterval(() => {
      if (child.exitCode !== null || child.signalCode !== null) complete(child.exitCode, child.signalCode)
    }, 25)
    if (settled) clearInterval(poll)
  })
  const dumpCompletion = wait(dump)
  const restoreCompletion = wait(restore)
  let dumpErrorBytes = 0; let restoreErrorBytes = 0
  dump.stderr.on('data', (chunk) => { dumpErrorBytes += chunk.length; if (dumpErrorBytes > 64 * 1024) dump.kill() })
  restore.stderr.on('data', (chunk) => { restoreErrorBytes += chunk.length; if (restoreErrorBytes > 64 * 1024) restore.kill() })
  let transferred = 0
  const limiter = new Transform({ transform(chunk, _encoding, callback) {
    transferred += chunk.length
    if (transferred > 1_073_741_824) callback(Object.assign(new Error('DUMP_LIMIT'), { code: 'DEV128_LOCAL_CLONE_SIZE_LIMIT' }))
    else callback(null, chunk)
  } })
  const pipe = pipeline(dump.stdout, limiter, restore.stdin)
  const [dumpResult, restoreResult, pipeResult] = await Promise.allSettled([dumpCompletion, restoreCompletion, pipe])
  if (pipeResult.status === 'rejected') { dump.kill(); restore.kill(); fail(pipeResult.reason?.code ?? 'DEV128_LOCAL_CLONE_PIPE_FAILED') }
  if (dumpResult.status !== 'fulfilled' || restoreResult.status !== 'fulfilled' || dumpResult.value.code !== 0 || restoreResult.value.code !== 0) fail('DEV128_LOCAL_PDM_SCHEMA_CLONE_FAILED')
  return { archiveBytes: transferred }
}

async function prepare() {
  if (process.argv.length !== 2) fail('DEV128_LOCAL_PREP_ARGUMENTS_INVALID')
  if (path.resolve(ROOT) !== path.resolve(CONFIG.localTarget.runtimeRoot) || await pathExists(ROOT)) fail('DEV128_LOCAL_TARGET_ALREADY_EXISTS')
  assertNoLinks([ROOT, OLD_ROOT])
  await ensurePortFree(TARGET_PORT)
  for (const binary of [INITDB, PG_CTL, PG_DUMP, PG_RESTORE]) if (!(await pathExists(binary))) fail('DEV128_POSTGRES_18_TOOLING_REQUIRED')
  for (const p of [OLD_PROFILE_PATH, OLD_OWNER_PATH, path.join(OLD_CONTROL, 'fixtures.json')]) if (!(await pathExists(p))) fail('DEV128_LOCAL_SOURCE_PROFILE_MISSING')
  const oldProfile = JSON.parse(await readFile(OLD_PROFILE_PATH, 'utf8'))
  const oldOwner = JSON.parse(await readFile(OLD_OWNER_PATH, 'utf8'))
  const oldRuntime = new URL(oldProfile.databaseUrl)
  if (oldProfile.applicationId !== 'ai-pdm' || oldProfile.sandboxId !== 'pdm-test-admin-1020' || oldProfile.origin !== 'http://localhost:1020' ||
      oldRuntime.hostname !== '127.0.0.1' || Number(oldRuntime.port) !== 58420 || oldRuntime.pathname !== '/jenfu_local_pdm_test_admin_1020' ||
      oldOwner.host !== '127.0.0.1' || Number(oldOwner.port) !== 58420 || oldOwner.user !== 'postgres' || oldOwner.database !== 'jenfu_local_pdm_test_admin_1020') fail('DEV128_LOCAL_SOURCE_PROFILE_INVALID')

  await mkdir(ROOT)
  taskRootCreated = true
  await setTaskRootAcl(ROOT)
  await mkdir(path.join(ROOT, 'postgres'))
  await mkdir(SANDBOX_ROOT)
  await mkdir(CONTROL)
  await mkdir(path.join(SANDBOX_ROOT, 'data'))
  await mkdir(path.join(SANDBOX_ROOT, 'repository'))
  await mkdir(path.join(ROOT, 'transfer'))
  await mkdir(path.join(CONTROL, 'imports'))
  await copyFile(path.join(OLD_CONTROL, 'fixtures.json'), path.join(CONTROL, 'fixtures.json'))
  const fixtureSha256 = sha256(await readFile(path.join(CONTROL, 'fixtures.json')))

  const ownerPassword = crypto.randomBytes(32).toString('base64url')
  const runtimePassword = crypto.randomBytes(32).toString('base64url')
  const owner = { host: '127.0.0.1', port: TARGET_PORT, user: 'postgres', password: ownerPassword, database: TARGET_DATABASE }
  const passwordFile = path.join(CONTROL, 'postgres-password.tmp')
  await writeFile(passwordFile, `${ownerPassword}\n`, { flag: 'wx', mode: 0o600 })
  try {
    await runChild(INITDB, ['-D',PGDATA,'-U','postgres','--encoding=UTF8','--locale=C','--auth-local=trust','--auth-host=scram-sha-256','--pwfile',passwordFile], { failureCode: 'DEV128_LOCAL_POSTGRES_INIT_FAILED' })
  } finally { await rm(passwordFile, { force: true }) }
  await runChild(PG_CTL, ['-D',PGDATA,'-l',PG_LOG,'-o',`-p ${TARGET_PORT} -h 127.0.0.1 -c shared_preload_libraries= -c archive_mode=off -c logging_collector=off`,'-w','start'], { failureCode: 'DEV128_LOCAL_POSTGRES_START_FAILED' })
  postgresStarted = true

  const source = await connect(oldOwner, oldOwner.database, 'ai-pdm-dev128-local-source-snapshot')
  let sourceSnapshot
  let targetAdmin
  try {
    sourceSnapshot = await readLocalSourceSnapshot(source)
    targetAdmin = await connect(owner, 'postgres', 'ai-pdm-dev128-local-target-setup')
    for (const role of sourceSnapshot.roles) await targetAdmin.query(`CREATE ROLE ${q(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
    await targetAdmin.query(`CREATE ROLE ${q(RUNTIME_ROLE)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
    await targetAdmin.query(`GRANT jenfu_ai_pdm_runtime TO ${q(RUNTIME_ROLE)}`)
    await targetAdmin.query(`ALTER ROLE postgres PASSWORD ${lit(ownerPassword)}`)
    await targetAdmin.query(`CREATE DATABASE ${q(TARGET_DATABASE)} OWNER postgres TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`)
    const clone = await pipeDumpToRestore({ sourceOwner: oldOwner, targetOwner: owner, snapshotId: sourceSnapshot.snapshotId })
    const target = await connect(owner, TARGET_DATABASE, 'ai-pdm-dev128-local-target-check')
    try {
      const targetCatalog = await readDatabaseCatalog(target, 'ai_pdm_core')
      const sourceShape = sourceSnapshot.sourceCatalog.tables.map(({ rowCount: _count, ...table }) => table)
      const targetShape = targetCatalog.tables.map(({ rowCount: _count, ...table }) => table)
      if (canonicalize(sourceShape) !== canonicalize(targetShape) || canonicalize(sourceSnapshot.sourceCatalog.foreignKeys) !== canonicalize(targetCatalog.foreignKeys)) fail('DEV128_LOCAL_CLONE_SCHEMA_READBACK_MISMATCH')
      const excludedData = new Set([...CONFIG.localTarget.clearOnImportTables, ...CONFIG.source.fileTables])
      for (const table of targetCatalog.tables) {
        const sourceCount = sourceSnapshot.sourceCounts.find((item) => item.name === table.name)?.rowCount
        if (excludedData.has(table.name) && table.rowCount !== 0) fail('DEV128_LOCAL_CLONE_EXCLUDED_DATA_REMAINS')
        if (!excludedData.has(table.name) && table.rowCount !== sourceCount) fail('DEV128_LOCAL_CLONE_ROW_COUNT_MISMATCH')
      }
      const appSchemas = (await target.query(`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY nspname`)).rows.map((row) => row.nspname)
      if (canonicalize(appSchemas) !== canonicalize(['ai_pdm_contract','ai_pdm_core','public'])) fail('DEV128_LOCAL_CLONE_SCHEMA_BOUNDARY_FAILED')
      const publicObjects = (await target.query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='public' AND relation.relkind IN ('r','p','v','m','S','f')`)).rows[0].count
      if (publicObjects !== 0) fail('DEV128_LOCAL_CLONE_PUBLIC_OBJECTS_PRESENT')
      await target.query('BEGIN')
      try {
        const clearTables = CONFIG.localTarget.clearOnImportTables.filter((table) => targetCatalog.tables.some((entry) => entry.name === table))
        const clearOrder = buildImportOrder({ tableNames: clearTables, foreignKeys: targetCatalog.foreignKeys })
        for (const name of clearOrder.reverse()) await target.query(`DELETE FROM ai_pdm_core.${q(name)}`)
        await target.query('COMMIT')
      } catch { await target.query('ROLLBACK').catch(() => undefined); fail('DEV128_LOCAL_CLONE_SENSITIVE_CLEAR_FAILED') }

      await targetAdmin.query(`ALTER ROLE ${q(RUNTIME_ROLE)} LOGIN PASSWORD ${lit(runtimePassword)}`)
      await targetAdmin.query(`ALTER ROLE ${q(RUNTIME_ROLE)} IN DATABASE ${q(TARGET_DATABASE)} SET search_path TO ai_pdm_core,pg_catalog`)
      const generation = crypto.randomUUID()
      const sandboxId = CONFIG.localTarget.sandboxId
      const targetIdentity = { applicationId:'ai-pdm', sandboxId, databaseName:TARGET_DATABASE, sandboxRoot:SANDBOX_ROOT,
        dataDirectory:path.join(SANDBOX_ROOT,'data'), repositoryDirectory:path.join(SANDBOX_ROOT,'repository'), generation,
        fixtureVersion:oldProfile.fixture.version, fixtureHash:oldProfile.fixture.hash, nativeSessionContractVersion:'jenfu.ai-pdm-session.v2' }
      const targetFingerprint = contractDigest(targetIdentity)
      const update = await target.query(`UPDATE ai_pdm_core.local_sandbox_target_metadata SET sandbox_id=$1,database_name=$2,
        sandbox_root=$3,data_directory=$4,repository_directory=$5,generation=$6,fixture_version=$7,fixture_hash=$8,
        native_session_contract_version=$9,target_fingerprint=$10,status='ready',updated_at=clock_timestamp()
        WHERE application_id='ai-pdm'`, [sandboxId,TARGET_DATABASE,SANDBOX_ROOT,targetIdentity.dataDirectory,targetIdentity.repositoryDirectory,
        generation,targetIdentity.fixtureVersion,targetIdentity.fixtureHash,targetIdentity.nativeSessionContractVersion,targetFingerprint])
      if (update.rowCount !== 1) fail('DEV128_LOCAL_TARGET_METADATA_UPDATE_FAILED')
      await targetAdmin.query(`COMMENT ON DATABASE ${q(TARGET_DATABASE)} IS ${lit(`jenfu.local-principal-bootstrap.v1:${sandboxId}:${generation}`)}`)

      const runtimeUrl = new URL(oldProfile.databaseUrl)
      runtimeUrl.username = RUNTIME_ROLE; runtimeUrl.password = runtimePassword; runtimeUrl.hostname = '127.0.0.1'; runtimeUrl.port = String(TARGET_PORT); runtimeUrl.pathname = `/${TARGET_DATABASE}`
      const profile = structuredClone(oldProfile)
      Object.assign(profile, { sandboxId, origin:'http://localhost:1020', bindHost:'127.0.0.1', runtimeRole:RUNTIME_ROLE,
        sandboxRoot:SANDBOX_ROOT, dataDirectory:targetIdentity.dataDirectory, repositoryDirectory:targetIdentity.repositoryDirectory,
        databaseUrl:runtimeUrl.href, fixture:{ ...oldProfile.fixture, path:path.join(CONTROL,'fixtures.json') },
        principalSessionKey:{ keyId:'pdm-test-admin-1020-masked-snapshot', secret:crypto.randomBytes(32).toString('base64url') },
        platformClient:{ clientId:'ai-pdm', key:crypto.randomBytes(32).toString('base64url') } })
      const ownerRecord = { ...owner, runtimeRole:RUNTIME_ROLE }
      await writeFile(path.join(CONTROL,'owner-connection.json'),`${JSON.stringify(ownerRecord,null,2)}\n`,{flag:'wx',mode:0o600})
      await writeFile(path.join(CONTROL,'ai-pdm-runtime.json'),`${JSON.stringify(profile,null,2)}\n`,{flag:'wx',mode:0o600})
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
      const keyId = sha256(crypto.createPublicKey(publicKey).export({type:'spki',format:'der'}))
      await writeFile(path.join(CONTROL,'dev128-recipient-private-key.pem'),privateKey,{flag:'wx',mode:0o600})
      await writeFile(path.join(CONTROL,'dev128-recipient-key.json'),`${JSON.stringify({schemaVersion:'jenfu.dev128.local-recipient-key.v1',keyId,publicKeyB64:Buffer.from(publicKey).toString('base64'),status:'READY'},null,2)}\n`,{flag:'wx',mode:0o600})

      const installUrl = new URL(runtimeUrl.href); installUrl.username='postgres'; installUrl.password=ownerPassword
      const install = await runChild(process.execPath,['install-local-test-admin.mjs','--install'],{cwd:HERE,
        env:safeBaseEnv({NODE_ENV:'development',JENFU_LOCAL_SANDBOX_ROOT:SANDBOX_ROOT,PDM_LOCAL_TEST_ADMIN_INSTALL_URL:installUrl.href}),
        failureCode:'DEV128_LOCAL_TEST_ADMIN_INSTALL_FAILED'})
      const runtime = await connect({host:'127.0.0.1',port:TARGET_PORT,user:RUNTIME_ROLE,password:runtimePassword,database:TARGET_DATABASE},TARGET_DATABASE,'ai-pdm-dev128-local-admin-check')
      try {
        await runtime.query('SELECT ai_pdm_core.ensure_local_test_admin_v1($1,$2,$3,$4)',[sandboxId,generation,profile.fixture.hash,targetFingerprint])
        const check=(await runtime.query(`SELECT (SELECT count(*)::integer FROM ai_pdm_core.users WHERE id='pdm-local-test-admin-user' AND company_id='company-jenfu' AND role='Admin' AND account_status='active' AND system_role_enabled=1 AND password_hash IS NULL) AS user_count,
          (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts WHERE principal_id='pdm-local-test-admin' AND pdm_user_id='pdm-local-test-admin-user' AND company_id='company-jenfu' AND account_status='active' AND system_role_enabled) AS principal_count`)).rows[0]
        if (check.user_count!==1 || check.principal_count!==1) fail('DEV128_LOCAL_TEST_ADMIN_READBACK_FAILED')
      } finally { await runtime.end() }
      const prepReceipt={schemaVersion:'jenfu.dev128.local-target-preparation.v1',profile:CONFIG.localTarget.profileName,database:TARGET_DATABASE,
        sourceProfile:'test-admin-1020',sourcePort:58420,targetPort:TARGET_PORT,sourceSchemaSha256:sourceSnapshot.schemaHash,
        fixtureSha256,sourcePdmTableCount:sourceSnapshot.sourceCatalog.tables.length,excludedTableDataCount:excludedData.size,
        sourceForeignKeysVerified:sourceSnapshot.verifiedForeignKeys,sourceMasterCounts:sourceSnapshot.masters,
        sourceMigrationSha256:sourceSnapshot.migrationSha256,
        cloneArchiveBytes:clone.archiveBytes,copyScope:['ai_pdm_core','ai_pdm_contract'],siblingSchemasCopied:false,rawProductionRowsCopied:false,status:'PASS'}
      const receiptPath=path.join(CONTROL,'preparation-receipt.json')
      await writeFile(receiptPath,`${JSON.stringify({...prepReceipt,receiptSha256:sha256(canonicalize(prepReceipt))},null,2)}\n`,{flag:'wx',mode:0o600})
      process.stdout.write(`${JSON.stringify({status:'PASS',profile:CONFIG.localTarget.profileName,database:TARGET_DATABASE,databasePort:TARGET_PORT,
        pgDataDirectory:PGDATA,sourcePdmTableCount:sourceSnapshot.sourceCatalog.tables.length,cloneArchiveBytes:clone.archiveBytes,
        recipientKeyId:keyId,localTestAdmin:true,ssoHandoffEnabled:false,siblingSchemasCopied:false,receipt:receiptPath})}\n`)
    } finally { await target.end() }
  } finally {
    await targetAdmin?.end().catch(() => undefined)
    await source.query('ROLLBACK').catch(() => undefined)
    await source.end()
  }
}

async function main() {
  try {
    await prepare()
  } catch (error) {
    if (postgresStarted) {
      await runChild(PG_CTL, ['-D', PGDATA, '-w', '-m', 'fast', 'stop'], {
        failureCode: 'DEV128_LOCAL_POSTGRES_STOP_FAILED',
        timeoutMs: 60_000
      }).catch(() => undefined)
      postgresStarted = false
    }
    if (taskRootCreated && path.resolve(ROOT) === path.resolve(CONFIG.localTarget.runtimeRoot)) {
      const value = await lstat(ROOT).catch(() => null)
      if (value && !value.isSymbolicLink()) await rm(ROOT, { recursive: true, force: true })
    }
    throw error
  }
}

async function pathExists(candidate) { try { await lstat(candidate); return true } catch (error) { if (error?.code==='ENOENT') return false; throw error } }

main().catch((error) => {
  process.stderr.write(`${error?.code ?? 'DEV128_LOCAL_PREP_FAILED'}\n`)
  process.exitCode = 1
})
