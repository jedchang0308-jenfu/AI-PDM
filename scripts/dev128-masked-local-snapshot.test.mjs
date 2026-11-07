import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { assertMaskedSnapshotPayload, createMaskedSnapshotPayload, decryptMaskedSnapshot, encryptMaskedSnapshot } from './lib/dev128-masked-local-snapshot.mjs'
import { parseJsonLosslessly } from './dev128-masked-local-snapshot-runner.mjs'

const config = JSON.parse(await readFile(new URL('../config/release/dev128-masked-local-production-snapshot.json', import.meta.url), 'utf8'))
const revision = 'a'.repeat(40)
const snapshotId = 'PDM-MASKED-20261107-1'

function makeCatalog({ requiredExcludedFk = false, identifyingFk = false } = {}) {
  const tableNames = new Set([
    ...config.source.requireEmptyTables,
    ...config.source.excludedTables,
    ...config.source.skipTables,
    'companies', 'users', 'items', 'file_assets'
  ])
  for (let i = 0; tableNames.size < config.source.expectedTableCount; i += 1) tableNames.add(`fixture_table_${String(i).padStart(3, '0')}`)
  const tables = [...tableNames].sort().map((name) => ({
    name,
    rowCount: name === 'schema_migrations' ? 7 : name === 'companies' || name === 'users' || name === 'items' || name === 'file_assets' ? 1 : 0,
    columns: [{ name: 'id', type: 'text', notNull: true, hasDefault: false, generated: false, identity: false }],
    primaryKey: ['id']
  }))
  const byName = new Map(tables.map((table) => [table.name, table]))
  const setColumns = (name, columns, primaryKey = ['id']) => {
    byName.get(name).columns = columns.map(([column, type, notNull = false]) => ({ name: column, type, notNull, hasDefault: false, generated: false, identity: false }))
    byName.get(name).primaryKey = primaryKey
  }
  setColumns('companies', [['id', 'text', true], ['name', 'character varying(80)', true]])
  setColumns('users', [['id', 'text', true], ['display_name', 'character varying(100)', true], ['email', 'character varying(254)'], ['phone_number', 'bigint'], ['password_hash', 'text'], ['role', 'text', true], ['company_id', 'text', true], ['account_status', 'text', true], ['created_at', 'timestamp with time zone', true], ['created_by', 'text']])
  setColumns('items', [['id', 'text', true], ['company_id', 'text', true], ['part_number', 'text', true], ['part_name', 'text', true], ['created_by', 'text'], ['created_at', 'timestamp with time zone', true], ['details_json', 'jsonb']])
  setColumns('file_assets', [['id', 'text', true], ['company_id', 'text', true], ['file_name', 'text', true], ['storage_bucket', 'text'], ['storage_key', 'text'], ['file_url', 'text'], ['file_bytes', 'bytea'], ['content_sha256', 'character(64)']])
  if (requiredExcludedFk) {
    setColumns('items', [['id', 'text', true], ['company_id', 'text', true], ['part_number', 'text', true], ['part_name', 'text', true], ['created_by', 'text'], ['created_at', 'timestamp with time zone', true], ['details_json', 'jsonb'], ['auth_id', 'text', true]])
  }
  const foreignKeys = [
    { childTable: 'users', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] },
    { childTable: 'users', childColumns: ['created_by'], parentTable: 'users', parentColumns: ['id'] },
    { childTable: 'items', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] },
    { childTable: 'items', childColumns: ['created_by'], parentTable: 'users', parentColumns: ['id'] },
    { childTable: 'file_assets', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] }
  ]
  if (requiredExcludedFk) foreignKeys.push({ childTable: 'items', childColumns: ['auth_id'], parentTable: 'auth_identities', parentColumns: ['id'] })
  if (identifyingFk) foreignKeys.push({ childTable: 'file_assets', childColumns: ['id'], parentTable: 'items', parentColumns: ['id'] })
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database: 'jenfu_prod', schema: 'ai_pdm_core', tables, foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

function makeRows(catalog, { requiredExcludedFk = false, identifyingFk = false } = {}) {
  const rows = new Map()
  for (const table of catalog.tables) if (!config.source.requireEmptyTables.includes(table.name) && !config.source.excludedTables.includes(table.name) && !config.source.skipTables.includes(table.name)) rows.set(table.name, [])
  rows.get('companies').push({ id: 'company-jenfu', name: 'Jenfu Manufacturing Company' })
  rows.get('users').push({ id: 'real-user-1088', display_name: 'Wang Example', email: 'wang@example.com', phone_number: { __dev128_number_v1__: '886912345678' }, password_hash: '$2b$12$do-not-export', role: 'R&D Manager', company_id: 'company-jenfu', account_status: 'active', created_at: '2026-11-06T12:00:00.000Z', created_by: 'real-user-1088' })
  const item = { id: 'part-7654', company_id: 'company-jenfu', part_number: 'PDM-7654', part_name: 'Customer Rotor Assembly', created_by: 'real-user-1088', created_at: '2026-11-06T12:10:00.000Z', details_json: { customer_email: 'secret.customer@example.net', customer_phone: { __dev128_number_v1__: '886912345678' }, created_by: 'real-user-1088', status: 'approved', notes: 'Private customer product description' } }
  if (requiredExcludedFk) item.auth_id = 'auth-1'
  rows.get('items').push(item)
  rows.get('file_assets').push({ id: identifyingFk ? 'part-7654' : 'asset-1', company_id: 'company-jenfu', file_name: 'Customer-assembly-secret.sldprt', storage_bucket: 'jenfu-private-production-bucket', storage_key: 'parts/production/secret.sldprt', file_url: 'https://storage.googleapis.com/private/secret', file_bytes: Buffer.from('raw CAD contents'), content_sha256: 'a'.repeat(64) })
  return rows
}

function buildPayload(options = {}) {
  const sourceCatalog = makeCatalog(options)
  return createMaskedSnapshotPayload({ config, snapshotId, sourceRevision: revision, sourceCatalog, rowsByTable: makeRows(sourceCatalog, options) })
}

test('masks business snapshot identifiers and personal data while preserving safe enums and relationships', () => {
  const { payload, scan } = buildPayload()
  assert.equal(payload.tables.some((table) => table.name === 'platform_principal_mappings'), false)
  assert.equal(payload.tables.some((table) => table.name === 'system_settings'), false)
  assert.equal(payload.tables.some((table) => table.name === 'schema_migrations'), false)
  const users = payload.tables.find((table) => table.name === 'users').rows
  const user = users[0]
  assert.notEqual(user.id, 'real-user-1088')
  assert.notEqual(user.email, 'wang@example.com')
  assert.equal(user.email.endsWith('@example.invalid'), true)
  assert.equal(user.password_hash, null)
  assert.equal(user.phone_number, null)
  assert.equal(user.role, 'R&D Manager')
  assert.equal(user.created_by, user.id)
  const companies = payload.tables.find((table) => table.name === 'companies').rows
  assert.equal(companies[0].id, 'company-jenfu')
  const item = payload.tables.find((table) => table.name === 'items').rows[0]
  assert.equal(item.company_id, companies[0].id)
  assert.equal(item.created_by, user.id)
  assert.equal(item.created_at, '2026-11-06T12:10:00.000Z')
  assert.notEqual(item.part_number, 'PDM-7654')
  assert.equal(Object.values(item.details_json).some((value) => typeof value === 'string' && value.endsWith('@example.invalid')), true)
  assert.equal(Object.values(item.details_json).includes(user.id), true)
  assert.equal(Object.values(item.details_json).includes(null), true)
  assert.equal(item.details_json.status, 'approved')
  assert.equal(Object.keys(item.details_json).some((key) => key.startsWith('masked_key_')), true)
  const file = payload.tables.find((table) => table.name === 'file_assets').rows[0]
  assert.equal(file.file_bytes, null)
  assert.equal(file.file_url, null)
  assert.ok(file.storage_bucket === null || file.storage_bucket === 'masked-local-snapshot')
  assert.match(file.storage_key, /^masked-snapshot-not-exported\//u)
  assert.match(file.content_sha256, /^[a-f0-9]{64}$/u)
  assert.equal(scan.emailFindings, 0)
  assert.equal(scan.rawUserIdFindings, 0)
  assert.equal(scan.binaryFindings, 0)
  assert.equal(assertMaskedSnapshotPayload({ config, payload, expectedSourceRevision: revision }), payload)
})

test('rejects a required reference to an excluded authentication table', () => {
  assert.throws(() => buildPayload({ requiredExcludedFk: true }), { code: 'DEV128_REQUIRED_REFERENCE_TO_EXCLUDED_TABLE' })
})

test('identifying foreign keys share one masked value across the whole equivalence class', () => {
  const { payload } = buildPayload({ identifyingFk: true })
  const item = payload.tables.find((table) => table.name === 'items').rows[0]
  const file = payload.tables.find((table) => table.name === 'file_assets').rows[0]
  assert.notEqual(item.id, 'part-7654')
  assert.equal(file.id, item.id)
})

test('encrypts only the masked payload and detects ciphertext tampering', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
  const { payload } = buildPayload()
  const encrypted = encryptMaskedSnapshot({ payload, publicKeyPem: publicKey, maxEncryptedBytes: 20 * 1024 * 1024 })
  const decrypted = decryptMaskedSnapshot({ bytes: encrypted.bytes, privateKeyPem: privateKey, expectedKeyId: encrypted.keyId, maxEncryptedBytes: 20 * 1024 * 1024, maxUncompressedBytes: config.source.maxUncompressedBytes })
  assert.equal(decrypted.payloadSha256, payload.payloadSha256)
  const corrupted = Buffer.from(encrypted.bytes)
  corrupted[corrupted.length - 2] ^= 0x01
  assert.throws(() => decryptMaskedSnapshot({ bytes: corrupted, privateKeyPem: privateKey, expectedKeyId: encrypted.keyId, maxEncryptedBytes: 20 * 1024 * 1024, maxUncompressedBytes: config.source.maxUncompressedBytes }), (error) => ['DEV128_ENVELOPE_INVALID', 'DEV128_DECRYPTION_FAILED'].includes(error.code))
  assert.throws(() => decryptMaskedSnapshot({ bytes: encrypted.bytes, privateKeyPem: privateKey, expectedKeyId: '0'.repeat(64), maxEncryptedBytes: 20 * 1024 * 1024, maxUncompressedBytes: config.source.maxUncompressedBytes }), { code: 'DEV128_RECIPIENT_KEY_MISMATCH' })
})

test('payload validator rejects a hidden email even if the payload hash is recomputed', () => {
  const { payload: source } = buildPayload()
  const payload = structuredClone(source)
  const details = payload.tables.find((table) => table.name === 'items').rows[0].details_json
  details[Object.keys(details).find((key) => key.startsWith('masked_key_'))] = 'leaked.person@example.com'
  const core = { ...payload }; delete core.payloadSha256
  payload.payloadSha256 = sha256(canonicalize(core))
  assert.throws(() => assertMaskedSnapshotPayload({ config, payload }), { code: 'DEV128_EMAIL_SCAN_FAILED' })
})

test('payload binds the exact source catalog metadata', () => {
  const { payload: source } = buildPayload()
  const payload = structuredClone(source)
  payload.source.catalog.tables.find((table) => table.name === 'items').columns[0].type = 'integer'
  const core = { ...payload }; delete core.payloadSha256
  payload.payloadSha256 = sha256(canonicalize(core))
  assert.throws(() => assertMaskedSnapshotPayload({ config, payload }), { code: 'DEV128_PAYLOAD_METADATA_INVALID' })
})

test('source JSON numbers retain their exact decimal text through masking', () => {
  const parsed = parseJsonLosslessly('{"amount":900719925474099312345.678901,"nested":[-0.0000000000000000003,1e+42]}')
  assert.deepEqual(parsed, {
    amount: { __dev128_number_v1__: '900719925474099312345.678901' },
    nested: [{ __dev128_number_v1__: '-0.0000000000000000003' }, { __dev128_number_v1__: '1e+42' }]
  })
})
