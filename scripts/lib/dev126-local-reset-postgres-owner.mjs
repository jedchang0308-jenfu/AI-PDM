import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { spawn as nodeSpawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import pg from 'pg'
import { isLoopbackHost, LocalSandboxError } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { DEV126_LOCAL_RESET_BASELINE_POLICY as baselinePolicy } from './dev126-local-reset-baseline-owner.mjs'

const OWNER_ROLE = baselinePolicy.ownerRole
const require = createRequire(import.meta.url)
const pgpassHelper = require('pgpass/lib/helper')
const SCHEMA = baselinePolicy.schema
const CONTROL_RELATIONS = baselinePolicy.controlRelations
const POINTER_SOURCES = baselinePolicy.pointerSources
const SNAPSHOT_ID = /^[0-9a-f]+-[0-9a-f]+-[0-9]+$/iu
const SCOPED_LOGIN_ROLE = /^local_pdm_seed_[a-f0-9]{16}$/u
const MAX_PGPASSFILE_BYTES = 1024 * 1024
const HASH = /^[a-f0-9]{64}$/u
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/u
const OWNER_CONNECTION_SQL = `
  SELECT current_database() AS database_name, current_user AS current_user,
         session_user AS session_user, pg_catalog.host(inet_server_addr()) AS server_address,
         inet_server_port() AS server_port
`
const TARGET_METADATA_SQL = `
  SELECT application_id, sandbox_id, database_name, sandbox_root, data_directory,
         repository_directory, generation::text AS generation, fixture_version, fixture_hash,
         native_session_contract_version, target_fingerprint, status
  FROM ai_pdm_core.local_sandbox_target_metadata
  WHERE application_id = 'ai-pdm' AND sandbox_id = $1
`
const SCHEMA_OWNER_SQL = `
  SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner
  FROM pg_catalog.pg_namespace n WHERE n.nspname = $1
`
const RELATIONS_SQL = `
  SELECT c.relname AS name, c.relkind AS kind,
         pg_catalog.pg_get_userbyid(c.relowner) AS owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'm', 'f')
  ORDER BY c.relname
`
const AUTHORITY_SQL = `
  SELECT mode, expected_commit, schema_hash, row_version, switched_at
  FROM ai_pdm_core.pdm_workbench_state_authority_control WHERE id = 1
`
const SESSION_COUNTS_SQL = `
  SELECT (SELECT count(*)::text FROM ai_pdm_core.principal_session_records) AS principal_session_count,
         (SELECT count(*)::text FROM ai_pdm_core.local_sandbox_principal_session_bindings) AS principal_binding_count
`
const POINTER_QUERIES = Object.freeze({
  file_assets: `
    SELECT id::text AS source_id, storage_provider AS provider, storage_key AS key,
           original_path AS legacy_path, content_hash AS sha256, file_size::text AS bytes
    FROM ai_pdm_core.file_assets ORDER BY id
  `,
  file_derivatives: `
    SELECT id::text AS source_id, storage_provider AS provider, storage_key AS key,
           original_path AS legacy_path, content_hash AS sha256, file_size::text AS bytes
    FROM ai_pdm_core.file_derivatives ORDER BY id
  `,
  release_packages: `
    SELECT id::text AS source_id, storage_provider AS provider, storage_key AS key,
           local_path AS legacy_path, sha256, file_size::text AS bytes
    FROM ai_pdm_core.release_packages ORDER BY id
  `,
  submission_files: `
    SELECT id::text AS source_id, storage_provider AS provider, storage_key AS key,
           local_path AS legacy_path, sha256, file_size::text AS bytes
    FROM ai_pdm_core.submission_files ORDER BY id
  `,
})

function fail(code) {
  throw new LocalSandboxError(code, 503)
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function normalizedKey(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 ||
    value !== value.trim() || value.includes('\0') || value.includes('\\') || value.startsWith('/') ||
    /^[a-zA-Z]:/u.test(value)) fail('local_reset_owner_pointer_invalid')
  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('local_reset_owner_pointer_invalid')
  }
  return value
}

function keyFromLegacyPath(value, repositoryDirectory) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    fail('local_reset_owner_pointer_invalid')
  }
  const resolved = path.resolve(value)
  if (!isWithin(repositoryDirectory, resolved) || samePath(repositoryDirectory, resolved)) {
    fail('local_reset_owner_pointer_invalid')
  }
  return normalizedKey(path.relative(repositoryDirectory, resolved).split(path.sep).join('/'))
}

function pointerFromRow(sourceTable, row, repositoryDirectory) {
  if (!isRecord(row) || typeof row.source_id !== 'string' || row.source_id.length === 0 || row.source_id.length > 256) {
    fail('local_reset_owner_pointer_invalid')
  }
  const provider = row.provider == null || row.provider === '' ? 'local_repository' : String(row.provider).trim()
  if (!['local_repository', 'local', 'j_drive'].includes(provider)) {
    fail('local_reset_owner_external_storage')
  }
  const key = typeof row.key === 'string' && row.key.trim()
    ? normalizedKey(row.key.trim())
    : keyFromLegacyPath(row.legacy_path, repositoryDirectory)
  let sha256 = null
  if (row.sha256 != null && String(row.sha256).trim() !== '') {
    sha256 = String(row.sha256).trim().toLowerCase()
    if (!HASH.test(sha256)) fail('local_reset_owner_pointer_invalid')
  }
  let bytes = null
  if (row.bytes != null && String(row.bytes).trim() !== '') {
    const parsed = Number(row.bytes)
    if (!Number.isSafeInteger(parsed) || parsed < 0) fail('local_reset_owner_pointer_invalid')
    bytes = parsed
  }
  return Object.freeze({ sourceTable, sourceId: row.source_id, provider, key, sha256, bytes })
}

function validateScope(scope) {
  const excluded = CONTROL_RELATIONS.map((name) => `${SCHEMA}.${name}`).sort()
  if (!exactKeys(scope, [
    'schema', 'dumpFormat', 'dataOnly', 'includeAllOwnedTablesExceptControlRelations',
    'excludedTableData', 'pointerSources', 'consistency', 'excludeOwnerAndPrivileges',
  ]) || scope.schema !== SCHEMA || scope.dumpFormat !== 'custom' || scope.dataOnly !== true ||
    scope.includeAllOwnedTablesExceptControlRelations !== true ||
    !Array.isArray(scope.excludedTableData) || !Array.isArray(scope.pointerSources) ||
    JSON.stringify([...scope.excludedTableData].sort()) !== JSON.stringify(excluded) ||
    JSON.stringify([...scope.pointerSources].sort()) !== JSON.stringify([...POINTER_SOURCES].sort()) ||
    scope.consistency !== 'single-exported-postgresql-snapshot' || scope.excludeOwnerAndPrivileges !== true) {
    fail('local_reset_owner_scope_invalid')
  }
}

function validateInput(input) {
  if (!exactKeys(input, ['target', 'expectedDatabase', 'runtimeTargetObservation', 'scope']) ||
    !isRecord(input.target) || !exactKeys(input.expectedDatabase, [
      'databaseName', 'runtimeRole', 'databaseHost', 'databasePort', 'sandboxId', 'generation', 'targetFingerprint',
    ]) || !isRecord(input.runtimeTargetObservation) || !isRecord(input.runtimeTargetObservation.connection) ||
    !isRecord(input.runtimeTargetObservation.targetMetadata)) fail('local_reset_owner_input_invalid')
  const { target, expectedDatabase: expected, runtimeTargetObservation } = input
  if (target.applicationId !== 'ai-pdm' || target.databaseName !== expected.databaseName ||
    target.sandboxId !== expected.sandboxId || target.generation !== expected.generation ||
    target.targetFingerprint !== expected.targetFingerprint ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(expected.databaseHost).toLowerCase()) ||
    !Number.isSafeInteger(expected.databasePort) || expected.databasePort < 1 || expected.databasePort > 65535 ||
    !/^jenfu_local_[a-z0-9_]{3,51}$/u.test(expected.databaseName) ||
    !/^[a-z][a-z0-9_]{2,62}$/u.test(expected.runtimeRole) || expected.runtimeRole === OWNER_ROLE ||
    !/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.test(expected.generation ?? '') ||
    !HASH.test(expected.targetFingerprint ?? '')) fail('local_reset_owner_target_invalid')
  const observation = runtimeTargetObservation
  if (!exactKeys(observation.connection, ['databaseName', 'currentUser', 'sessionUser', 'serverAddress', 'serverPort']) ||
    observation.connection.databaseName !== expected.databaseName ||
    observation.connection.currentUser !== expected.runtimeRole || observation.connection.sessionUser !== expected.runtimeRole ||
    !isLoopbackHost(observation.connection.serverAddress) || observation.connection.serverPort !== expected.databasePort ||
    !exactKeys(observation.targetMetadata, [
      'applicationId', 'sandboxId', 'databaseName', 'sandboxRoot', 'dataDirectory', 'repositoryDirectory',
      'generation', 'fixtureVersion', 'fixtureHash', 'nativeSessionContractVersion', 'targetFingerprint', 'status',
    ]) || observation.targetMetadata.status !== 'ready' || observation.targetMetadata.applicationId !== 'ai-pdm' ||
    observation.targetMetadata.sandboxId !== expected.sandboxId ||
    observation.targetMetadata.databaseName !== expected.databaseName ||
    observation.targetMetadata.generation !== expected.generation ||
    observation.targetMetadata.targetFingerprint !== expected.targetFingerprint ||
    observation.targetMetadata.nativeSessionContractVersion !== 'jenfu.ai-pdm-session.v2' ||
    !samePath(observation.targetMetadata.sandboxRoot, target.sandboxRoot) ||
    !samePath(observation.targetMetadata.dataDirectory, target.dataDirectory) ||
    !samePath(observation.targetMetadata.repositoryDirectory, target.repositoryDirectory)) {
    fail('local_reset_owner_runtime_observation_mismatch')
  }
  validateScope(input.scope)
  return { target, expected, runtimeTargetObservation }
}

function oneRow(result, code) {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) fail(code)
  return result.rows[0]
}

async function rows(client, sql, values = []) {
  const result = await client.query(sql, values)
  if (!result || !Array.isArray(result.rows)) fail('local_reset_owner_readback_invalid')
  return result.rows
}

function validateConnectionEndpoint(connection, expected) {
  if (!connection || connection.database_name !== expected.databaseName ||
    !isLoopbackHost(connection.server_address) || !sameHost(expected.databaseHost, connection.server_address) ||
    Number(connection.server_port) !== expected.databasePort) fail('local_reset_owner_connection_mismatch')
}

function validateLoginConnection(connection, expected, ownerLogin) {
  validateConnectionEndpoint(connection, expected)
  if (connection.current_user !== ownerLogin || connection.session_user !== ownerLogin) {
    fail('local_reset_owner_login_connection_mismatch')
  }
}

function validateOwnerConnection(connection, expected, ownerLogin) {
  validateConnectionEndpoint(connection, expected)
  if (!connection || connection.database_name !== expected.databaseName ||
    connection.current_user !== OWNER_ROLE || connection.session_user !== ownerLogin ||
    !SCOPED_LOGIN_ROLE.test(connection.session_user ?? '')) fail('local_reset_owner_role_switch_mismatch')
  return Object.freeze({
    databaseName: connection.database_name,
    currentUser: connection.current_user,
    sessionUser: connection.session_user,
    serverAddress: connection.server_address,
    serverPort: Number(connection.server_port),
  })
}

function sameHost(expected, observed) {
  const normalize = (value) => String(value).toLowerCase().replace(/^\[|\]$/gu, '')
  const left = normalize(expected)
  const right = normalize(observed)
  return left === 'localhost' ? isLoopbackHost(right) : left === right
}

function validateMetadata(row, target, expected, runtimeObservation) {
  if (!row || row.application_id !== 'ai-pdm' || row.sandbox_id !== expected.sandboxId ||
    row.database_name !== expected.databaseName || row.generation !== expected.generation ||
    row.target_fingerprint !== expected.targetFingerprint || row.status !== 'ready' ||
    row.fixture_version !== runtimeObservation.targetMetadata.fixtureVersion ||
    row.fixture_hash !== runtimeObservation.targetMetadata.fixtureHash ||
    row.native_session_contract_version !== 'jenfu.ai-pdm-session.v2' ||
    !samePath(row.sandbox_root, target.sandboxRoot) || !samePath(row.data_directory, target.dataDirectory) ||
    !samePath(row.repository_directory, target.repositoryDirectory)) fail('local_reset_owner_target_mismatch')
  return Object.freeze({
    applicationId: 'ai-pdm', sandboxId: row.sandbox_id, databaseName: row.database_name,
    sandboxRoot: row.sandbox_root, dataDirectory: row.data_directory, repositoryDirectory: row.repository_directory,
    generation: row.generation, fixtureVersion: row.fixture_version, fixtureHash: row.fixture_hash,
    nativeSessionContractVersion: row.native_session_contract_version,
    targetFingerprint: row.target_fingerprint, status: row.status,
  })
}

function safeIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('local_reset_owner_relation_invalid')
  return `"${value.replaceAll('"', '""')}"`
}

async function relationSummary(client, relation) {
  const table = safeIdentifier(relation.name)
  const result = await rows(client,
    `SELECT pg_catalog.to_jsonb(t)::text AS row_json FROM ai_pdm_core.${table} AS t ORDER BY pg_catalog.to_jsonb(t)::text`)
  const digest = createHash('sha256')
  for (const row of result) {
    if (typeof row.row_json !== 'string') fail('local_reset_owner_row_hash_invalid')
    digest.update(row.row_json, 'utf8').update('\n', 'utf8')
  }
  return Object.freeze({ ...relation, rowCount: result.length, rowsSha256: digest.digest('hex') })
}

async function collectPointers(client, repositoryDirectory) {
  const pointers = []
  for (const sourceTable of POINTER_SOURCES) {
    const result = await rows(client, POINTER_QUERIES[sourceTable])
    for (const row of result) pointers.push(pointerFromRow(sourceTable, row, repositoryDirectory))
  }
  return Object.freeze(pointers)
}

function buildDumpArguments(expected, snapshotId) {
  return Object.freeze([
    '--no-password',
    '--host', expected.databaseHost,
    '--port', String(expected.databasePort),
    '--dbname', expected.databaseName,
    '--format=custom',
    '--data-only',
    '--no-owner',
    '--no-privileges',
    '--schema=ai_pdm_core',
    `--role=${OWNER_ROLE}`,
    `--snapshot=${snapshotId}`,
    '--lock-wait-timeout=5000',
    ...CONTROL_RELATIONS.map((name) => `--exclude-table-data=ai_pdm_core.${name}`),
  ])
}

function dumpEnvironment(environment, expected, ownerLogin, ownerPassword) {
  const childEnvironment = {}
  for (const name of [
    'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA',
  ]) {
    const key = Object.keys(environment).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    if (key && typeof environment[key] === 'string') childEnvironment[name] = environment[key]
  }
  childEnvironment.PGUSER = ownerLogin
  childEnvironment.PGPASSWORD = ownerPassword
  childEnvironment.PGHOST = expected.databaseHost
  childEnvironment.PGPORT = String(expected.databasePort)
  childEnvironment.PGDATABASE = expected.databaseName
  childEnvironment.PGSSLMODE = 'disable'
  childEnvironment.PGAPPNAME = 'ai-pdm-dev126-reset-baseline'
  return childEnvironment
}

function runPgDump(spawn, executable, args, env) {
  return new Promise((resolve, reject) => {
    let child
    const chunks = []
    let size = 0
    const timeout = setTimeout(() => {
      child?.kill?.('SIGTERM')
      reject(new Error('PG_DUMP_TIMEOUT'))
    }, 15 * 60 * 1000)
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      clearTimeout(timeout)
      reject(new Error('PG_DUMP_START_FAILED'))
      return
    }
    child.stdout?.on('data', (chunk) => {
      const bytes = Buffer.from(chunk)
      size += bytes.byteLength
      chunks.push(bytes)
    })
    // Drain stderr without retaining or printing it; libpq diagnostics may
    // include connection details that must stay out of logs.
    child.stderr?.on('data', () => {})
    child.once('error', () => {
      clearTimeout(timeout)
      reject(new Error('PG_DUMP_START_FAILED'))
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0 || size === 0) {
        reject(new Error('PG_DUMP_FAILED'))
        return
      }
      resolve(Buffer.concat(chunks, size))
    })
  })
}

function exactPgpassEntry(entry, connection) {
  return pgpassHelper.isValidEntry(entry) && pgpassHelper.match(connection, entry) &&
    entry.host === connection.host && String(entry.port) === String(connection.port) &&
    entry.database === connection.database && entry.user === connection.user
}

async function readExactPgpassPassword(passfile, connection) {
  if (typeof passfile !== 'string' || passfile.length === 0 || passfile.includes('\0') || !path.isAbsolute(passfile)) {
    fail('local_reset_owner_password_file_invalid')
  }
  const absolute = path.resolve(passfile)
  let pathStat
  let resolvedPath
  try {
    pathStat = await lstat(absolute)
    resolvedPath = await realpath(absolute)
  } catch {
    fail('local_reset_owner_password_file_invalid')
  }
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink > 1 ||
    !samePath(absolute, resolvedPath) || pathStat.size > MAX_PGPASSFILE_BYTES ||
    (process.platform !== 'win32' && (pathStat.mode & 0o077) !== 0)) {
    fail('local_reset_owner_password_file_invalid')
  }

  let file
  try {
    const noFollow = fsConstants.O_NOFOLLOW ?? 0
    file = await open(absolute, fsConstants.O_RDONLY | noFollow)
    const fileStat = await file.stat()
    if (!fileStat.isFile() || fileStat.nlink > 1 || fileStat.dev !== pathStat.dev || fileStat.ino !== pathStat.ino ||
      fileStat.size !== pathStat.size || fileStat.size > MAX_PGPASSFILE_BYTES ||
      (process.platform !== 'win32' && (fileStat.mode & 0o077) !== 0)) {
      fail('local_reset_owner_password_file_invalid')
    }
    const content = await file.readFile()
    if (content.byteLength !== fileStat.size || content.includes(0)) fail('local_reset_owner_password_file_invalid')
    const exactMatches = []
    for (const line of content.toString('utf8').split(/\r?\n/u)) {
      const entry = pgpassHelper.parseLine(line)
      if (entry && exactPgpassEntry(entry, connection)) exactMatches.push(entry.password)
    }
    if (exactMatches.length !== 1) fail('local_reset_owner_password_file_no_exact_match')
    return exactMatches[0]
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    fail('local_reset_owner_password_file_invalid')
  } finally {
    try { await file?.close() } catch {}
  }
}

function createOwnerPasswordResolver(environment, expected, ownerLogin) {
  const connection = Object.freeze({
    host: expected.databaseHost,
    port: expected.databasePort,
    database: expected.databaseName,
    user: ownerLogin,
  })
  let passwordPromise
  return async (connectionParameters) => {
    if (!connectionParameters || connectionParameters.host !== connection.host ||
      Number(connectionParameters.port) !== connection.port || connectionParameters.database !== connection.database ||
      connectionParameters.user !== connection.user) fail('local_reset_owner_password_target_mismatch')
    if (!passwordPromise) {
      passwordPromise = typeof environment.PGPASSWORD === 'string' && environment.PGPASSWORD.length > 0
        ? Promise.resolve(environment.PGPASSWORD)
        : readExactPgpassPassword(environment.PGPASSFILE, connection)
    }
    return passwordPromise
  }
}

/**
 * Build the PDM-only offline owner snapshot adapter. The runtime observation
 * remains separate; this connection authenticates as a task-scoped LOGIN and
 * uses SET LOCAL ROLE for the fixed migrator owner. environment.PGUSER must
 * match local_pdm_seed_[a-f0-9]{16}; credentials come from PGPASSWORD or PGPASSFILE.
 * Neither Pool nor pg_dump is invoked until captureAiPdmCoreSnapshot is called.
 */
export function createDev126LocalPostgresSnapshotOwner({
  Pool = pg.Pool,
  spawn = nodeSpawn,
  environment = process.env,
} = {}) {
  if (typeof Pool !== 'function' || typeof spawn !== 'function' || !isRecord(environment)) {
    throw new TypeError('LOCAL_RESET_OWNER_ADAPTER_INVALID')
  }

  return Object.freeze({
    async captureAiPdmCoreSnapshot(input) {
      const { target, expected, runtimeTargetObservation } = validateInput(input)
      const ownerLogin = environment.PGUSER
      if (typeof ownerLogin !== 'string' || !SCOPED_LOGIN_ROLE.test(ownerLogin)) {
        fail('local_reset_owner_login_role_invalid')
      }
      if (!(typeof environment.PGPASSWORD === 'string' && environment.PGPASSWORD.length > 0) &&
        !(typeof environment.PGPASSFILE === 'string' && environment.PGPASSFILE.length > 0)) {
        fail('local_reset_owner_credentials_unavailable')
      }
      const password = createOwnerPasswordResolver(environment, expected, ownerLogin)
      const ownerPassword = await password({
        host: expected.databaseHost, port: expected.databasePort,
        database: expected.databaseName, user: ownerLogin,
      })
      const poolOptions = {
        host: expected.databaseHost,
        port: expected.databasePort,
        database: expected.databaseName,
        user: ownerLogin,
        password,
        max: 1,
        connectionTimeoutMillis: 5000,
        statement_timeout: 120000,
        query_timeout: 125000,
        ssl: false,
        options: '-c timezone=UTC -c datestyle=ISO,YMD -c search_path=pg_catalog',
        application_name: 'ai-pdm-dev126-reset-baseline',
      }
      let pool
      let client
      try {
        pool = new Pool(poolOptions)
        client = await pool.connect()
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        const loginConnection = oneRow(await client.query(OWNER_CONNECTION_SQL),
          'local_reset_owner_connection_readback_invalid')
        validateLoginConnection(loginConnection, expected, ownerLogin)
        const txReadOnly = oneRow(await client.query('SHOW transaction_read_only'),
          'local_reset_owner_transaction_mode_invalid')
        if (txReadOnly.transaction_read_only !== 'on') fail('local_reset_owner_transaction_mode_invalid')
        await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`)
        const connection = validateOwnerConnection(oneRow(await client.query(OWNER_CONNECTION_SQL),
          'local_reset_owner_connection_readback_invalid'), expected, ownerLogin)
        const exportedSnapshot = oneRow(await client.query('SELECT pg_catalog.pg_export_snapshot() AS snapshot_id'),
          'local_reset_owner_snapshot_unavailable')
        const snapshotId = String(exportedSnapshot.snapshot_id ?? '')
        if (!SNAPSHOT_ID.test(snapshotId)) fail('local_reset_owner_snapshot_unavailable')

        const schemaRows = await rows(client, SCHEMA_OWNER_SQL, [SCHEMA])
        if (schemaRows.length !== 1 || schemaRows[0].schema_owner !== OWNER_ROLE) {
          fail('local_reset_owner_schema_mismatch')
        }
        const metadata = validateMetadata(oneRow(await client.query(TARGET_METADATA_SQL, [expected.sandboxId]),
          'local_reset_owner_target_mismatch'), target, expected, runtimeTargetObservation)
        const authorityRow = oneRow(await client.query(AUTHORITY_SQL), 'local_reset_owner_authority_invalid')
        const authority = Object.freeze({
          mode: String(authorityRow.mode), expectedCommit: String(authorityRow.expected_commit),
          schemaHash: String(authorityRow.schema_hash), rowVersion: Number(authorityRow.row_version),
          switchedAt: new Date(authorityRow.switched_at).toISOString(),
        })
        const counts = oneRow(await client.query(SESSION_COUNTS_SQL), 'local_reset_owner_registry_readback_invalid')
        const principalSessionCount = Number(counts.principal_session_count)
        const principalBindingCount = Number(counts.principal_binding_count)
        if (!Number.isSafeInteger(principalSessionCount) || principalSessionCount !== 0 ||
          !Number.isSafeInteger(principalBindingCount) || principalBindingCount !== 0) {
          fail('local_reset_owner_registry_not_empty')
        }

        const catalog = await rows(client, RELATIONS_SQL, [SCHEMA])
        if (catalog.length === 0 || catalog.some((relation) => relation.kind === 'f')) {
          fail('local_reset_owner_relation_invalid')
        }
        const catalogNames = new Set(catalog.map((relation) => relation.name))
        if (CONTROL_RELATIONS.some((name) => !catalogNames.has(name)) ||
          !catalog.some((relation) => !CONTROL_RELATIONS.includes(relation.name))) {
          fail('local_reset_owner_relation_invalid')
        }
        const relations = []
        for (const relation of catalog) {
          if (!IDENTIFIER.test(relation.name) || !['r', 'p', 'm'].includes(relation.kind) ||
            relation.owner !== OWNER_ROLE) fail('local_reset_owner_relation_invalid')
          relations.push(await relationSummary(client, Object.freeze({
            name: relation.name, kind: relation.kind, owner: relation.owner,
          })))
        }
        const pointers = await collectPointers(client, target.repositoryDirectory)
        const dataDump = await runPgDump(spawn,
          process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
          buildDumpArguments(expected, snapshotId), dumpEnvironment(environment, expected, ownerLogin, ownerPassword))
        const includedRelations = relations.map((relation) => relation.name)
          .filter((name) => !CONTROL_RELATIONS.includes(name)).sort()
        await client.query('COMMIT')
        return Object.freeze({
          snapshotId,
          connection,
          targetMetadata: metadata,
          schemaOwner: OWNER_ROLE,
          authority,
          principalSessionCount,
          principalBindingCount,
          relations: Object.freeze(relations),
          dataDump: Object.freeze({ format: 'custom-data-only', bytes: dataDump, includedRelations }),
          storagePointers: pointers,
        })
      } catch (error) {
        try { await client?.query('ROLLBACK') } catch {}
        if (error instanceof LocalSandboxError) throw error
        fail('local_reset_owner_capture_failed')
      } finally {
        try { client?.release?.() } catch {}
        try { await pool?.end?.() } catch {}
      }
    },
  })
}

export const DEV126_LOCAL_POSTGRES_SNAPSHOT_OWNER_POLICY = Object.freeze({
  schema: SCHEMA,
  ownerRole: OWNER_ROLE,
  scopedLoginPattern: 'local_pdm_seed_[a-f0-9]{16}',
  roleSwitch: `SET LOCAL ROLE ${OWNER_ROLE}`,
  controlRelations: CONTROL_RELATIONS,
  pointerSources: POINTER_SOURCES,
  dumpExecutable: process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
  dumpFormat: 'custom-data-only',
  transaction: 'repeatable-read-read-only-exported-snapshot',
})
