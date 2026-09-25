import { sha256, canonicalize } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
// The Production operator runs against firebase_bff. A local historical
// google_oauth row is not a reachable login source for this owner operation.
const SOURCE_KINDS = new Set(['firebase_mapping'])

function fail(code) { throw new Error(`DEV121_${code}`) }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}

export function parseInventoryArgs(argv) {
  const allowed = new Set(['--operation-ref', '--operation-sha256', '--source-revision', '--output-ref'])
  if (!Array.isArray(argv) || argv.length !== 8) fail('ARGUMENT_INVALID')
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!allowed.has(key) || typeof argv[index + 1] !== 'string' ||
      !argv[index + 1] || Object.hasOwn(args, key)) fail('ARGUMENT_INVALID')
    args[key] = argv[index + 1]
  }
  if (!H64.test(args['--operation-sha256'] ?? '') ||
      !H40.test(args['--source-revision'] ?? '') ||
      Object.keys(args).length !== 4) fail('ARGUMENT_INVALID')
  return {
    operationRef: args['--operation-ref'],
    operationSha256: args['--operation-sha256'],
    sourceRevision: args['--source-revision'],
    outputRef: args['--output-ref'],
  }
}

export function assertInventoryOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('OPERATION_HASH_MISMATCH')
  const keys = ['schemaVersion', 'operationId', 'mode', 'sourceRevision', 'projectId',
    'region', 'database', 'applicationId', 'firebaseProjectId', 'sources',
    'expectedSourceHash', 'expectedRowVersion']
  if (!exactKeys(value, keys) || value.schemaVersion !== 'ai-pdm.principal-inventory-operation.v1' ||
      value.sourceRevision !== sourceRevision || value.projectId !== 'jenfu-platform-prod' ||
      value.region !== 'asia-east1' || value.database !== 'jenfu_prod' ||
      value.applicationId !== 'ai-pdm' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/u.test(value.operationId ?? '') ||
      !['preview', 'register', 'coverage'].includes(value.mode) ||
      (value.mode === 'coverage'
        ? value.firebaseProjectId !== null || !Array.isArray(value.sources) || value.sources.length !== 0
        : !/^[a-z][a-z0-9-]{0,62}$/u.test(value.firebaseProjectId ?? '') ||
          !Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 2)) {
    fail('OPERATION_INVALID')
  }
  const sourceKeys = ['pdmUserId', 'companyId', 'principalId', 'employeeId',
    'sourceKind', 'identityIssuer', 'identitySubject', 'mappingVersion', 'publishedAt']
  const seen = new Set()
  for (const source of value.sources) {
    if (!exactKeys(source, sourceKeys) || !SOURCE_KINDS.has(source.sourceKind) ||
      seen.has(source.sourceKind) || source.pdmUserId !== value.sources[0].pdmUserId ||
      source.companyId !== value.sources[0].companyId ||
      source.principalId !== value.sources[0].principalId ||
      source.employeeId !== value.sources[0].employeeId ||
      source.identityIssuer !== `https://securetoken.google.com/${value.firebaseProjectId}` ||
      !Number.isSafeInteger(source.mappingVersion) || source.mappingVersion < 1 ||
      source.principalId.startsWith('pdm:') ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(source.publishedAt ?? '') ||
      !Number.isFinite(Date.parse(source.publishedAt)) ||
      [source.pdmUserId, source.companyId, source.principalId, source.employeeId,
        source.identitySubject].some((item) => typeof item !== 'string' ||
        item.length < 1 || item.length > 255 || item.trim() !== item)) fail('OPERATION_SOURCE_INVALID')
    seen.add(source.sourceKind)
  }
  if (value.mode === 'register'
    ? !H64.test(value.expectedSourceHash ?? '') ||
      !Number.isSafeInteger(value.expectedRowVersion) || value.expectedRowVersion < 0
    : value.expectedSourceHash !== null || value.expectedRowVersion !== null) {
    fail('OPERATION_EXPECTATION_INVALID')
  }
  return value
}

function bindNamed(sql, params = {}) {
  const values = []
  const names = new Map()
  const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)\b/gu, (_, name) => {
    if (!Object.hasOwn(params, name)) fail('SQL_PARAMETER_MISSING')
    if (!names.has(name)) { values.push(params[name]); names.set(name, values.length) }
    return `$${names.get(name)}`
  })
  if (Object.keys(params).some((name) => !names.has(name))) fail('SQL_PARAMETER_UNUSED')
  return { text: bound, values }
}

/** A single pg.Client is used by the owner Job, so every repository read stays in its transaction. */
export function inventoryDatabaseAdapter(database) {
  const client = {
    kind: 'postgres',
    async query(sql, params) { return (await database.query(bindNamed(sql, params))).rows },
    async queryOne(sql, params) { return (await client.query(sql, params))[0] ?? null },
    async execute(sql, params) { await database.query(bindNamed(sql, params)) },
    async transaction(fn, options) {
      if (options?.isolationLevel !== 'repeatable_read') fail('TRANSACTION_MODE_INVALID')
      await database.query(options.readOnly
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN ISOLATION LEVEL REPEATABLE READ')
      try {
        const result = await fn(client)
        await database.query('COMMIT')
        return result
      } catch (error) {
        await database.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    },
  }
  return client
}

export async function assertInventoryDatabaseTarget(database, login) {
  const { rows } = await database.query(`SELECT current_database() AS database,
    current_user AS login, current_setting('server_version_num')::integer / 10000 AS major,
    pg_has_role(current_user, 'jenfu_ai_pdm_migrator', 'MEMBER') AS migrator_member,
    to_regnamespace('ai_pdm_core') IS NOT NULL AS schema_ready`)
  const row = rows[0]
  if (rows.length !== 1 || row.database !== 'jenfu_prod' || row.login !== login ||
      Number(row.major) !== 17 || row.migrator_member !== true ||
      row.schema_ready !== true) fail('DATABASE_TARGET_MISMATCH')
  return { database: row.database, login: row.login, major: Number(row.major) }
}
