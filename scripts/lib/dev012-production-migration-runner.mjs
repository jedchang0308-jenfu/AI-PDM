import { createHash } from 'node:crypto'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SAFE_SEGMENT = /^[A-Za-z0-9._/-]+$/u

export class ProductionMigrationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') {
  throw new ProductionMigrationError(code, detail)
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function parseRunnerArgs(argv) {
  const allowed = new Set(['--bundle-ref', '--bundle-sha256', '--source-revision', '--output-ref'])
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!allowed.has(key) || !argv[index + 1]) fail('MIGRATION_ARGUMENT_INVALID', key)
    value[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (Object.keys(value).length !== 4 || !H64.test(value.bundleSha256 ?? '') || !H40.test(value.sourceRevision ?? '')) fail('MIGRATION_ARGUMENT_INVALID')
  return value
}

export function parseGsUri(uri, expectedBucket, expectedPrefix) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/u.exec(uri ?? '')
  if (!match || match[1] !== expectedBucket || !match[2].startsWith(`${expectedPrefix}/`) || !SAFE_SEGMENT.test(match[2]) || match[2].includes('..')) fail('MIGRATION_GCS_REF_INVALID')
  return { bucket: match[1], object: match[2] }
}

function crc32cTable() {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0x82f63b78 : value >>> 1
    table[index] = value >>> 0
  }
  return table
}

const CRC32C_TABLE = crc32cTable()
export function crc32cBase64(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC32C_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return buffer.toString('base64')
}

async function responseBytes(response, code) {
  if (!response.ok) fail(code, String(response.status))
  return Buffer.from(await response.arrayBuffer())
}

export async function readGcsObject({ uri, expectedBucket, expectedPrefix, token, fetchImpl = fetch }) {
  const ref = parseGsUri(uri, expectedBucket, expectedPrefix)
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(ref.bucket)}/o/${encodeURIComponent(ref.object)}`
  const headers = { authorization: `Bearer ${token}` }
  const metadataResponse = await fetchImpl(base, { headers, signal: AbortSignal.timeout(20_000) })
  if (!metadataResponse.ok) fail('MIGRATION_GCS_METADATA_FAILED', String(metadataResponse.status))
  const metadata = await metadataResponse.json()
  if (!/^[1-9][0-9]*$/u.test(String(metadata.generation ?? '')) || typeof metadata.crc32c !== 'string') fail('MIGRATION_GCS_METADATA_INVALID')
  const media = await responseBytes(await fetchImpl(`${base}?alt=media&generation=${encodeURIComponent(metadata.generation)}`, { headers, signal: AbortSignal.timeout(30_000) }), 'MIGRATION_GCS_MEDIA_FAILED')
  if (crc32cBase64(media) !== metadata.crc32c) fail('MIGRATION_GCS_CRC32C_MISMATCH')
  return { bytes: media, generation: String(metadata.generation), crc32c: metadata.crc32c, ref }
}

export async function publishGcsJson({ uri, expectedBucket, expectedPrefix, value, token, fetchImpl = fetch }) {
  const ref = parseGsUri(uri, expectedBucket, expectedPrefix)
  const bytes = Buffer.from(`${canonicalize(value)}\n`, 'utf8')
  const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(ref.bucket)}/o?uploadType=media&name=${encodeURIComponent(ref.object)}&ifGenerationMatch=0`
  const response = await fetchImpl(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: bytes, signal: AbortSignal.timeout(30_000) })
  if (response.status === 412) {
    const existing = await readGcsObject({ uri, expectedBucket, expectedPrefix, token, fetchImpl })
    if (!existing.bytes.equals(bytes)) fail('MIGRATION_GCS_IMMUTABILITY_CONFLICT')
    return { ...existing, sha256: sha256(bytes), reused: true }
  }
  if (!response.ok) fail('MIGRATION_GCS_PUBLISH_FAILED', String(response.status))
  const metadata = await response.json()
  const readback = await readGcsObject({ uri, expectedBucket, expectedPrefix, token, fetchImpl })
  if (!readback.bytes.equals(bytes) || String(metadata.generation) !== readback.generation) fail('MIGRATION_GCS_READBACK_MISMATCH')
  return { ...readback, sha256: sha256(bytes), reused: false }
}

export async function metadataAccessToken(fetchImpl = fetch) {
  const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) fail('MIGRATION_METADATA_TOKEN_FAILED', String(response.status))
  const value = await response.json()
  if (typeof value.access_token !== 'string' || value.access_token.length < 20 || Number(value.expires_in) < 60) fail('MIGRATION_METADATA_TOKEN_INVALID')
  return value.access_token
}

export function assertRunnerTarget(environment, target) {
  const observed = {
    ownerApplicationId: environment.OWNER_APPLICATION_ID,
    releaseBucket: environment.RELEASE_BUCKET,
    projectId: environment.GOOGLE_CLOUD_PROJECT,
    region: environment.GOOGLE_CLOUD_REGION,
    connectionName: environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
    database: environment.POSTGRES_DATABASE,
    login: environment.POSTGRES_IAM_LOGIN,
    socket: environment.POSTGRES_SOCKET,
    job: environment.CLOUD_RUN_JOB,
  }
  const expected = {
    ownerApplicationId: target.ownerApplicationId,
    releaseBucket: target.releaseBucket,
    projectId: 'jenfu-platform-prod',
    region: 'asia-east1',
    connectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    database: 'jenfu_prod',
    login: target.login,
    socket: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    job: target.job,
  }
  if (canonicalize(observed) !== canonicalize(expected)) fail('MIGRATION_PRODUCTION_TARGET_MISMATCH')
  return expected
}

export function assertMigrationBundle(value, { target, sourceRevision, bundleSha256, bytes }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== bundleSha256) fail('MIGRATION_BUNDLE_SHA256_MISMATCH')
  const keys = ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'projectId', 'region', 'database', 'ledger', 'baselineCount', 'entries', 'manifestSha256']
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(keys.sort())) fail('MIGRATION_BUNDLE_KEYS_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.migration-bundle.v1' || value.ownerApplicationId !== target.ownerApplicationId || value.sourceRevision !== sourceRevision || value.projectId !== 'jenfu-platform-prod' || value.region !== 'asia-east1' || value.database !== 'jenfu_prod' || value.ledger !== target.ledger || value.baselineCount !== target.baselineCount) fail('MIGRATION_BUNDLE_TARGET_MISMATCH')
  if (!Array.isArray(value.entries) || value.entries.length < value.baselineCount) fail('MIGRATION_BUNDLE_ENTRIES_INVALID')
  const manifestCore = { ...value }
  delete manifestCore.manifestSha256
  if (!H64.test(value.manifestSha256 ?? '') || sha256(canonicalize(manifestCore)) !== value.manifestSha256) fail('MIGRATION_BUNDLE_MANIFEST_MISMATCH')
  const versions = new Set()
  for (const [index, entry] of value.entries.entries()) {
    const entryKeys = ['order', 'version', 'name', 'path', 'sourceSha256', 'appliedSha256', 'sqlBase64']
    if (!entry || canonicalize(Object.keys(entry).sort()) !== canonicalize(entryKeys.sort()) || entry.order !== index + 1 || !/^[a-z0-9][a-z0-9-]{5,95}$/u.test(entry.version ?? '') || versions.has(entry.version) || !SAFE_SEGMENT.test(entry.path ?? '') || !H64.test(entry.sourceSha256 ?? '') || !H64.test(entry.appliedSha256 ?? '')) fail('MIGRATION_BUNDLE_ENTRY_INVALID', String(index + 1))
    let sql
    try { sql = Buffer.from(entry.sqlBase64, 'base64') } catch { fail('MIGRATION_BUNDLE_SQL_INVALID', entry.version) }
    if (sql.length === 0 || sha256(sql) !== entry.appliedSha256) fail('MIGRATION_BUNDLE_SQL_HASH_MISMATCH', entry.version)
    versions.add(entry.version)
  }
  return value
}

export function createMigrationBundle({ target, sourceRevision, entries }) {
  if (!H40.test(sourceRevision ?? '') || !Array.isArray(entries)) fail('MIGRATION_BUNDLE_BUILD_INPUT_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev012.migration-bundle.v1',
    ownerApplicationId: target.ownerApplicationId,
    sourceRevision,
    projectId: 'jenfu-platform-prod',
    region: 'asia-east1',
    database: 'jenfu_prod',
    ledger: target.ledger,
    baselineCount: target.baselineCount,
    entries,
  }
  const bundle = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${canonicalize(bundle)}\n`, 'utf8')
  assertMigrationBundle(bundle, { target, sourceRevision, bundleSha256: sha256(bytes), bytes })
  return { bundle, bytes, bundleSha256: sha256(bytes) }
}

export function planMigration(bundle, ledgerRows) {
  if (!Array.isArray(ledgerRows) || ledgerRows.length > bundle.entries.length) fail('MIGRATION_LEDGER_LENGTH_INVALID')
  for (const [index, row] of ledgerRows.entries()) {
    const entry = bundle.entries[index]
    if (!entry || row.version !== entry.version || row.name !== entry.name || String(row.checksum_sha256).trim() !== entry.appliedSha256) fail('MIGRATION_LEDGER_PREFIX_MISMATCH', row.version ?? String(index))
  }
  if (ledgerRows.length < bundle.baselineCount) fail('MIGRATION_BASELINE_INCOMPLETE')
  return bundle.entries.slice(ledgerRows.length)
}

async function readLedger(database, ledger) {
  if (!/^[a-z_][a-z0-9_]*\.schema_migrations$/u.test(ledger)) fail('MIGRATION_LEDGER_NAME_INVALID')
  return (await database.query(`SELECT version, name, btrim(checksum_sha256) AS checksum_sha256, source_revision FROM ${ledger} ORDER BY applied_at, version`)).rows
}

async function readDatabaseBoundary(database, target) {
  const identity = (await database.query("SELECT current_database() AS database, current_user AS user, current_setting('server_version_num')::integer / 10000 AS \"postgresMajor\", pg_has_role(current_user, $1, 'MEMBER') AS \"migratorMember\", has_schema_privilege($2, $3, 'CREATE') AS \"runtimeCanCreateCore\"", [target.migratorRole, target.runtimeRole, target.coreSchema])).rows[0]
  const sibling = (await database.query("SELECT schema_name, CASE WHEN to_regnamespace(schema_name) IS NULL THEN false ELSE has_schema_privilege(current_user, schema_name, 'USAGE') END AS can_use FROM unnest($1::text[]) AS schema_name ORDER BY schema_name", [target.siblingCoreSchemas])).rows
  if (identity?.database !== 'jenfu_prod' || identity?.user !== target.login || Number(identity?.postgresMajor) !== 17 || identity?.migratorMember !== true || identity?.runtimeCanCreateCore !== false || sibling.some((row) => row.can_use === true)) fail('MIGRATION_DATABASE_BOUNDARY_FAILED')
  return { ...identity, siblingCore: sibling }
}

export async function executeProductionMigration({ bundle, database, target, sourceRevision, denyDatabaseConnect, now = () => new Date().toISOString() }) {
  const startedAt = now()
  await readDatabaseBoundary(database, target)
  let ledger = await readLedger(database, target.ledger)
  let pending = planMigration(bundle, ledger)
  await database.query("SELECT pg_advisory_lock(hashtext($1), hashtext(current_database()))", [`dev012-${target.ownerApplicationId}`])
  let applied = 0
  try {
    ledger = await readLedger(database, target.ledger)
    pending = planMigration(bundle, ledger)
    for (const entry of pending) {
      await database.query('BEGIN')
      try {
        await database.query(Buffer.from(entry.sqlBase64, 'base64').toString('utf8'))
        await database.query(`INSERT INTO ${target.ledger}(version,name,checksum_sha256,source_revision) VALUES ($1,$2,$3,$4)`, [entry.version, entry.name, entry.appliedSha256, sourceRevision])
        await database.query('COMMIT')
        applied += 1
      } catch (error) {
        await database.query('ROLLBACK')
        throw error
      }
    }
    ledger = await readLedger(database, target.ledger)
    if (ledger.length !== bundle.entries.length) fail('MIGRATION_LEDGER_READBACK_LENGTH_MISMATCH')
    planMigration(bundle, ledger)
  } finally {
    await database.query("SELECT pg_advisory_unlock(hashtext($1), hashtext(current_database()))", [`dev012-${target.ownerApplicationId}`]).catch(() => undefined)
  }
  const crossDatabaseDenials = []
  for (const databaseName of ['jenfu_dev', 'jenfu_stg']) {
    const denied = await denyDatabaseConnect(databaseName)
    if (denied !== true) fail('MIGRATION_CROSS_DATABASE_DENIAL_FAILED', databaseName)
    crossDatabaseDenials.push({ database: databaseName, denied: true })
  }
  const completedAt = now()
  const receiptCore = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1',
    ownerApplicationId: target.ownerApplicationId,
    sourceRevision,
    database: 'jenfu_prod',
    ledger: target.ledger,
    manifestSha256: bundle.manifestSha256,
    baselineCount: bundle.baselineCount,
    ledgerCount: ledger.length,
    applied,
    replayed: bundle.entries.length - applied,
    crossDatabaseDenials,
    boundaryStatus: 'PASS',
    executionName: process.env.CLOUD_RUN_EXECUTION ?? null,
    startedAt,
    completedAt,
    status: 'PASS',
  }
  return { ...receiptCore, receiptSha256: sha256(canonicalize(receiptCore)) }
}
