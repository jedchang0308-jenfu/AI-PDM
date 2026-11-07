import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { assertMaskedSnapshotPayload, createMaskedSnapshotPayload, decryptMaskedSnapshot, encryptMaskedSnapshot } from './lib/dev128-masked-local-snapshot.mjs'
import { parseJsonLosslessly } from './dev128-masked-local-snapshot-runner.mjs'

const config = JSON.parse(await readFile(new URL('../config/release/dev128-masked-local-production-snapshot.json', import.meta.url), 'utf8'))
const catalogShape = JSON.parse(await readFile(new URL('../config/release/dev128-masked-local-production-catalog-shape.json', import.meta.url), 'utf8'))
const revision = 'a'.repeat(40)
const snapshotId = 'PDM-MASKED-20261107-1'

function makeCatalog({ requiredExcludedFk = false, identifyingFk = false, compositeFk = null, nullableExcludedFk = false, businessSession = false } = {}) {
  const tableNames = new Set([
    ...config.source.requireEmptyTables,
    ...config.source.excludedTables,
    ...config.source.skipTables,
    'companies', 'users', 'items', 'file_assets', 'composite_parents', 'composite_children', 'business_sessions', 'business_session_events'
  ])
  for (let i = 0; tableNames.size < config.source.expectedTableCount; i += 1) tableNames.add(`fixture_table_${String(i).padStart(3, '0')}`)
  const tables = [...tableNames].sort().map((name) => ({
    name,
    rowCount: name === 'schema_migrations' ? 7 : name === 'companies' || name === 'users' || name === 'items' || name === 'file_assets' || (compositeFk && (name === 'composite_parents' || name === 'composite_children')) || (businessSession && (name === 'business_sessions' || name === 'business_session_events')) ? 1 : 0,
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
  setColumns('items', [['id', 'text', true], ['company_id', 'text', true], ['part_number', 'text', true], ['part_name', 'text', true], ['created_by', 'text'], ['created_at', 'timestamp with time zone', true], ['standard_cost', 'numeric', true], ['tracking_uuid', 'uuid', true], ['details_json', 'jsonb']])
  setColumns('file_assets', [['id', 'text', true], ['company_id', 'text', true], ['file_name', 'text', true], ['storage_bucket', 'text'], ['storage_key', 'text'], ['file_url', 'text'], ['file_bytes', 'bytea'], ['content_sha256', 'character(64)']])
  setColumns('principal_accounts', [['company_id', 'text', true], ['pdm_user_id', 'text', true], ['principal_id', 'text', true]], ['company_id', 'pdm_user_id', 'principal_id'])
  setColumns('composite_parents', [['tenant_id', 'text', true], ['id', 'text', true]], ['tenant_id', 'id'])
  setColumns('composite_children', [['id', 'text', true], ['tenant_id', 'text', true], ['parent_id', 'text']], ['id'])
  setColumns('business_sessions', [['id', 'text', true], ['session_purpose', 'text', true]], ['id'])
  setColumns('business_session_events', [['id', 'text', true], ['session_id', 'text', true], ['expected_session_version', 'integer', true]], ['id'])
  if (requiredExcludedFk) {
    setColumns('items', [['id', 'text', true], ['company_id', 'text', true], ['part_number', 'text', true], ['part_name', 'text', true], ['created_by', 'text'], ['created_at', 'timestamp with time zone', true], ['standard_cost', 'numeric', true], ['tracking_uuid', 'uuid', true], ['details_json', 'jsonb'], ['auth_id', 'text', true]])
  }
  if (nullableExcludedFk) {
    setColumns('items', [['id', 'text', true], ['company_id', 'text', true], ['part_number', 'text', true], ['part_name', 'text', true], ['created_by', 'text'], ['created_at', 'timestamp with time zone', true], ['standard_cost', 'numeric', true], ['tracking_uuid', 'uuid', true], ['details_json', 'jsonb'], ['actor_id', 'text', true], ['actor_principal_id', 'text']])
  }
  const foreignKeys = [
    { childTable: 'users', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] },
    { childTable: 'users', childColumns: ['created_by'], parentTable: 'users', parentColumns: ['id'] },
    { childTable: 'items', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] },
    { childTable: 'items', childColumns: ['created_by'], parentTable: 'users', parentColumns: ['id'] },
    { childTable: 'file_assets', childColumns: ['company_id'], parentTable: 'companies', parentColumns: ['id'] }
  ]
  if (requiredExcludedFk) foreignKeys.push({ childTable: 'items', childColumns: ['auth_id'], parentTable: 'auth_identities', parentColumns: ['id'] })
  if (nullableExcludedFk) foreignKeys.push({ childTable: 'items', childColumns: ['company_id', 'actor_id', 'actor_principal_id'], parentTable: 'principal_accounts', parentColumns: ['company_id', 'pdm_user_id', 'principal_id'] })
  if (identifyingFk) foreignKeys.push({ childTable: 'file_assets', childColumns: ['id'], parentTable: 'items', parentColumns: ['id'] })
  if (compositeFk) foreignKeys.push({ childTable: 'composite_children', childColumns: ['tenant_id', 'parent_id'], parentTable: 'composite_parents', parentColumns: ['tenant_id', 'id'] })
  if (businessSession) foreignKeys.push({ childTable: 'business_session_events', childColumns: ['session_id'], parentTable: 'business_sessions', parentColumns: ['id'] })
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database: 'jenfu_prod', schema: 'ai_pdm_core', tables, foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

function makeRows(catalog, { requiredExcludedFk = false, identifyingFk = false, compositeFk = null, nullableExcludedFk = false, businessSession = false } = {}) {
  const rows = new Map()
  for (const table of catalog.tables) if (!config.source.requireEmptyTables.includes(table.name) && !config.source.excludedTables.includes(table.name) && !config.source.skipTables.includes(table.name)) rows.set(table.name, [])
  rows.get('companies').push({ id: 'company-jenfu', name: 'Jenfu Manufacturing Company' })
  rows.get('users').push({ id: 'real-user-1088', display_name: 'Wang Example', email: 'wang@example.com', phone_number: { __dev128_number_v1__: '886912345678' }, password_hash: '$2b$12$do-not-export', role: 'R&D Manager', company_id: 'company-jenfu', account_status: 'active', created_at: '2026-11-06T12:00:00.000Z', created_by: 'real-user-1088' })
  const item = { id: 'part-7654', company_id: 'company-jenfu', part_number: 'PDM-7654', part_name: 'Customer Rotor Assembly', created_by: 'real-user-1088', created_at: '2026-11-06T12:10:00.000Z', standard_cost: { __dev128_number_v1__: '12345678.90' }, tracking_uuid: '91df3d31-4380-4f4a-a78b-64b0dc2168ab', details_json: { customer_email: 'secret.customer@example.net', customer_phone: { __dev128_number_v1__: '886912345678' }, created_by: 'real-user-1088', status: 'approved', notes: 'Private customer product description' } }
  if (requiredExcludedFk) item.auth_id = 'auth-1'
  if (nullableExcludedFk) {
    item.actor_id = 'real-user-1088'
    item.actor_principal_id = 'principal-1'
  }
  rows.get('items').push(item)
  rows.get('file_assets').push({ id: identifyingFk ? 'part-7654' : 'asset-1', company_id: 'company-jenfu', file_name: 'Customer-assembly-secret.sldprt', storage_bucket: 'jenfu-private-production-bucket', storage_key: 'parts/production/secret.sldprt', file_url: 'https://storage.googleapis.com/private/secret', file_bytes: Buffer.from('raw CAD contents'), content_sha256: 'a'.repeat(64) })
  if (compositeFk) {
    rows.get('composite_parents').push({ tenant_id: 'tenant-a', id: 'parent-1' })
    rows.get('composite_children').push({ id: 'child-1', tenant_id: compositeFk === 'valid' ? 'tenant-a' : 'tenant-b', parent_id: compositeFk === 'partial-null' ? null : 'parent-1' })
  }
  if (businessSession) {
    rows.get('business_sessions').push({ id: 'recognition-session-1', session_purpose: 'geometry_review' })
    rows.get('business_session_events').push({ id: 'recognition-event-1', session_id: 'recognition-session-1', expected_session_version: 7 })
  }
  return rows
}

function buildPayload(options = {}) {
  const sourceCatalog = makeCatalog(options)
  return createMaskedSnapshotPayload({ config, snapshotId, sourceRevision: revision, sourceCatalog, rowsByTable: makeRows(sourceCatalog, options) })
}

test('copies business rows as-is while removing credentials and attachment bytes', () => {
  const { payload, scan } = buildPayload()
  assert.equal(payload.masking.businessDataCopiedAsIs, true)
  assert.equal(payload.masking.credentialDataExported, false)
  assert.equal(payload.masking.identityMapRetained, false)
  assert.equal(payload.masking.fileBytesExported, false)
  assert.equal(payload.tables.some((table) => table.name === 'platform_principal_mappings'), false)
  assert.equal(payload.tables.some((table) => table.name === 'system_settings'), false)
  assert.equal(payload.tables.some((table) => table.name === 'schema_migrations'), false)
  const users = payload.tables.find((table) => table.name === 'users').rows
  const user = users[0]
  assert.equal(user.id, 'real-user-1088')
  assert.equal(user.email, 'wang@example.com')
  assert.equal(user.password_hash, null)
  assert.deepEqual(user.phone_number, { __dev128_number_v1__: '886912345678' })
  assert.equal(user.role, 'R&D Manager')
  assert.equal(user.created_by, user.id)
  const companies = payload.tables.find((table) => table.name === 'companies').rows
  assert.equal(companies[0].id, 'company-jenfu')
  const item = payload.tables.find((table) => table.name === 'items').rows[0]
  assert.equal(item.company_id, companies[0].id)
  assert.equal(item.created_by, user.id)
  assert.equal(item.created_at, '2026-11-06T12:10:00.000Z')
  assert.equal(item.part_number, 'PDM-7654')
  assert.equal(item.part_name, 'Customer Rotor Assembly')
  assert.deepEqual(item.standard_cost, { __dev128_number_v1__: '12345678.90' })
  assert.equal(item.tracking_uuid, '91df3d31-4380-4f4a-a78b-64b0dc2168ab')
  assert.equal(item.details_json.customer_email, 'secret.customer@example.net')
  assert.deepEqual(item.details_json.customer_phone, { __dev128_number_v1__: '886912345678' })
  assert.equal(item.details_json.created_by, user.id)
  assert.equal(item.details_json.notes, 'Private customer product description')
  assert.equal(item.details_json.status, 'approved')
  const file = payload.tables.find((table) => table.name === 'file_assets').rows[0]
  assert.equal(file.file_name, 'Customer-assembly-secret.sldprt')
  assert.equal(file.file_bytes, null)
  assert.equal(file.file_url, null)
  assert.ok(file.storage_bucket === null || file.storage_bucket === 'local-business-copy')
  assert.match(file.storage_key, /^local-business-copy-not-exported\//u)
  assert.match(file.content_sha256, /^[a-f0-9]{64}$/u)
  assert.equal(scan.emailFindings, 0)
  assert.equal(scan.rawUserIdFindings, 0)
  assert.equal(scan.binaryFindings, 0)
  assert.equal(assertMaskedSnapshotPayload({ config, payload, expectedSourceRevision: revision }), payload)
})

test('rejects a required reference to an excluded authentication table', () => {
  assert.throws(() => buildPayload({ requiredExcludedFk: true }), { code: 'DEV128_REQUIRED_REFERENCE_TO_EXCLUDED_TABLE' })
})

test('configured output tables have no all-required foreign key to an excluded parent', () => {
  const skipped = new Set([...config.source.requireEmptyTables, ...config.source.excludedTables, ...config.source.skipTables])
  const byName = new Map(catalogShape.tables.map((table) => [table.name, table]))
  const unsafe = catalogShape.foreignKeys.filter((fk) => !skipped.has(fk.childTable) && skipped.has(fk.parentTable) && fk.childColumns.every((column) => byName.get(fk.childTable).columns.find((item) => item.name === column)?.notNull === true))
  assert.deepEqual(unsafe, [])
})

test('MATCH SIMPLE clears only one nullable component of an excluded composite parent reference', () => {
  const { payload } = buildPayload({ nullableExcludedFk: true })
  const user = payload.tables.find((table) => table.name === 'users').rows[0]
  const item = payload.tables.find((table) => table.name === 'items').rows[0]
  assert.equal(item.company_id, 'company-jenfu')
  assert.equal(item.actor_id, user.id)
  assert.equal(item.actor_principal_id, null)
})

test('business workflow sessions are copied as-is without being treated as authentication sessions', () => {
  const { payload } = buildPayload({ businessSession: true })
  const session = payload.tables.find((table) => table.name === 'business_sessions').rows[0]
  const event = payload.tables.find((table) => table.name === 'business_session_events').rows[0]
  assert.equal(session.id, 'recognition-session-1')
  assert.equal(session.session_purpose, 'geometry_review')
  assert.equal(event.session_id, session.id)
  assert.equal(event.expected_session_version, 7)
})

test('identifying foreign keys retain the original business relationship', () => {
  const { payload } = buildPayload({ identifyingFk: true })
  const item = payload.tables.find((table) => table.name === 'items').rows[0]
  const file = payload.tables.find((table) => table.name === 'file_assets').rows[0]
  assert.equal(item.id, 'part-7654')
  assert.equal(file.id, item.id)
})

test('MATCH SIMPLE composite foreign key skips parent lookup when any child component is null', () => {
  const { payload } = buildPayload({ compositeFk: 'partial-null' })
  const child = payload.tables.find((table) => table.name === 'composite_children').rows[0]
  assert.equal(child.parent_id, null)
  assert.equal(child.tenant_id, 'tenant-b')
})

test('composite foreign key still rejects a missing all-non-null parent tuple', () => {
  assert.throws(() => buildPayload({ compositeFk: 'missing' }), { code: 'DEV128_FOREIGN_KEY_SOURCE_REFERENCE_MISSING' })
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

test('payload validator permits authorized raw business email text', () => {
  const { payload: source } = buildPayload()
  const payload = structuredClone(source)
  payload.tables.find((table) => table.name === 'items').rows[0].details_json.customer_email = 'person@example.com'
  const core = { ...payload }; delete core.payloadSha256
  payload.payloadSha256 = sha256(canonicalize(core))
  assert.equal(assertMaskedSnapshotPayload({ config, payload }), payload)
})

test('payload validator accepts structured UUIDs that resemble phone numbers', () => {
  const { payload: source } = buildPayload()
  const payload = structuredClone(source)
  payload.tables.find((table) => table.name === 'items').rows[0].tracking_uuid = '00000000-0000-4000-8000-000000000000'
  const core = { ...payload }; delete core.payloadSha256
  payload.payloadSha256 = sha256(canonicalize(core))
  assert.equal(assertMaskedSnapshotPayload({ config, payload }), payload)
})

test('payload validator permits authorized raw business phone text', () => {
  const { payload: source } = buildPayload()
  const payload = structuredClone(source)
  payload.tables.find((table) => table.name === 'items').rows[0].part_name = '+886 912 345 678'
  const core = { ...payload }; delete core.payloadSha256
  payload.payloadSha256 = sha256(canonicalize(core))
  assert.equal(assertMaskedSnapshotPayload({ config, payload }), payload)
})

test('raw business copy still removes nested credential values', () => {
  const sourceCatalog = makeCatalog()
  const rowsByTable = makeRows(sourceCatalog)
  rowsByTable.get('items')[0].details_json.api_token = 'must-not-copy'
  const { payload } = createMaskedSnapshotPayload({ config, snapshotId, sourceRevision: revision, sourceCatalog, rowsByTable })
  assert.equal(payload.tables.find((table) => table.name === 'items').rows[0].details_json.api_token, null)
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
