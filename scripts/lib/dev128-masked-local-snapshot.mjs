import crypto from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { canonicalize, sha256 } from './dev012-production-data-cutover.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const SNAPSHOT_ID = /^PDM-MASKED-[0-9]{8}-[0-9]{1,12}$/u
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu
const PHONE = /(?<![A-Z0-9])(?:\+?\d[\d ().-]{7,}\d)(?![A-Z0-9])/gu
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const ABSOLUTE_PATH = /(?:[A-Z]:\\|\\\\[^\\]+\\|\bgs:\/\/|\bhttps?:\/\/)/iu
const HARD_SECRET = /password|secret|token|credential|private|api[_-]?key|client[_-]?secret|provider[_-]?subject|firebase[_-]?(uid|id)|ip[_-]?(hash|address)/iu
const USER_REFERENCE = /(^|_)(user|pdm_user|actor|created_by|updated_by|deleted_by|approved_by|published_by|revoked_by|activated_by|retired_by|changed_by)(_|$)/iu
const LOSSLESS_NUMBER_KEY = '__dev128_number_v1__'

function fail(code) { const error = new Error(code); error.code = code; throw error }
function safeName(value) { return /^[a-z_][a-z0-9_]*$/u.test(value ?? '') }
function safeIdentifier(value) { if (!safeName(value)) fail('DEV128_IDENTIFIER_INVALID'); return `"${value}"` }
function asSet(values) { return new Set(values ?? []) }
function patternMatches(patterns, value) { return (patterns ?? []).some((pattern) => new RegExp(pattern, 'iu').test(value ?? '')) }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date) }
function maxLength(type) { const match = /\((\d+)\)/u.exec(type ?? ''); return match ? Number(match[1]) : null }
function typeFamily(type) {
  const value = String(type ?? '').toLowerCase()
  if (value === 'uuid') return 'uuid'
  if (/\b(date|time|timestamp|interval)\b/u.test(value)) return 'temporal'
  if (/\b(smallint|integer|bigint|serial|bigserial)\b/u.test(value)) return 'integer'
  if (/\b(numeric|decimal|real|double precision)\b/u.test(value)) return 'numeric'
  if (/\b(character varying|varchar|character|char|text|name)\b/u.test(value)) return 'text'
  if (/\b(bytea)\b/u.test(value)) return 'binary'
  return 'other'
}

export function assertMaskedSnapshotConfig(config) {
  if (!config || config.schemaVersion !== 'jenfu.dev128.ai-pdm-masked-local-production-snapshot.v1' ||
      config.ownerApplicationId !== 'ai-pdm' || config.source?.projectId !== 'jenfu-platform-prod' ||
      config.source?.database !== 'jenfu_prod' || config.source?.schema !== 'ai_pdm_core' ||
      config.source?.instanceConnectionName !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' ||
      config.source?.serviceAccount !== 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' ||
      config.source?.databaseLogin !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' ||
      config.source?.catalogShapePath !== 'config/release/dev128-masked-local-production-catalog-shape.json' ||
      !H64.test(config.source?.catalogShapeSha256 ?? '') ||
      config.releaseBucket !== 'jenfu-platform-prod-aipdm-release' ||
      config.objectPrefix !== 'source/migration-bundles/data-cutover/masked-local-snapshots' ||
      config.transfer?.encryption !== 'RSA-OAEP-SHA256+A256GCM' ||
      config.transfer?.artifactRetentionDays !== 1 || config.transfer?.gcsDeleteGenerationMatch !== true ||
      config.masking?.businessDataPolicy !== 'COPY_AS_IS' ||
       config.localTarget?.runtimeRoot !== 'C:\\VIBE CODING\\.local\\AI_PDM\\test-admin-1020-masked-snapshot' ||
       config.localTarget?.applicationPort !== 1020 || config.localTarget?.databasePort !== 58421 || config.localTarget?.schema !== 'ai_pdm_core' ||
       config.localTarget?.sandboxId !== 'pdm-test-admin-1020-masked-snapshot' ||
       config.localTarget?.profileName !== 'test-admin-1020-masked-snapshot' ||
      !Number.isSafeInteger(config.source?.expectedTableCount) || !Number.isSafeInteger(config.source?.expectedCopyTableCount) ||
      !Number.isSafeInteger(config.source?.maxRows) || !Number.isSafeInteger(config.source?.maxUncompressedBytes) ||
      !Number.isSafeInteger(config.source?.maxEncryptedBytes)) fail('DEV128_CONFIG_INVALID')
  for (const list of ['requireEmptyTables', 'skipTables', 'fileTables']) {
    const values = config.source[list]
    if (!Array.isArray(values) || values.some((value) => !safeName(value)) || new Set(values).size !== values.length) fail('DEV128_CONFIG_INVALID')
  }
  if (!Array.isArray(config.source.excludedTables) || config.source.excludedTables.some((value) => !safeName(value)) || new Set(config.source.excludedTables).size !== config.source.excludedTables.length) fail('DEV128_CONFIG_INVALID')
  const requiredSensitiveTables = ['account_invitations', 'account_recovery_requests', 'account_session_records', 'auth_identities', 'principal_accounts', 'principal_role_assignments', 'principal_session_records', 'readonly_shares', 'role_policy_commands', 'secret_references', 'system_settings', 'user_role_assignments', 'windows_service_devices', 'windows_service_enrollments']
  if (requiredSensitiveTables.some((name) => !config.source.skipTables.includes(name)) ||
      canonicalize(config.source.excludedTables) !== canonicalize(['schema_migrations'])) fail('DEV128_CONFIG_INVALID')
  const clearTables = config.localTarget.clearOnImportTables
  const preserveTables = config.localTarget.preserveLocalTables
  if (!Array.isArray(clearTables) || clearTables.some((name) => !safeName(name)) || new Set(clearTables).size !== clearTables.length ||
      !Array.isArray(preserveTables) || preserveTables.some((name) => !safeName(name)) || new Set(preserveTables).size !== preserveTables.length ||
      clearTables.some((name) => preserveTables.includes(name)) ||
      config.source.skipTables.filter((name) => name !== 'pdm_local_data_migrations').some((name) => !clearTables.includes(name) && !preserveTables.includes(name)) ||
      [...clearTables, ...preserveTables].some((name) => !config.source.skipTables.includes(name))) fail('DEV128_CONFIG_INVALID')
  for (const list of ['sensitiveColumnPatterns', 'freeTextColumnPatterns', 'safeEnumColumnPatterns', 'safeEnumValues', 'safeJsonKeys']) {
    if (!Array.isArray(config.masking?.[list]) || config.masking[list].length === 0) fail('DEV128_CONFIG_INVALID')
  }
  if (config.masking.safeJsonKeys.some((name) => !safeName(name)) || new Set(config.masking.safeJsonKeys).size !== config.masking.safeJsonKeys.length) fail('DEV128_CONFIG_INVALID')
  return config
}

export function assertProductionCatalogShape({ catalog, shape, expectedSha256 }) {
  if (!catalog || !shape || shape.schemaVersion !== 'jenfu.dev128.ai-pdm-production-catalog-shape.v1' ||
      shape.ownerApplicationId !== 'ai-pdm' || shape.database !== 'jenfu_prod' || shape.schema !== 'ai_pdm_core' ||
      !H64.test(shape.shapeSha256 ?? '') || shape.shapeSha256 !== expectedSha256) fail('DEV128_CATALOG_SHAPE_INVALID')
  const core = { ...shape }; delete core.shapeSha256
  if (sha256(canonicalize(core)) !== shape.shapeSha256) fail('DEV128_CATALOG_SHAPE_HASH_MISMATCH')
  const actual = {
    schemaVersion: shape.schemaVersion,
    ownerApplicationId: shape.ownerApplicationId,
    database: catalog.database,
    schema: catalog.schema,
    tables: catalog.tables.map(({ name, columns, primaryKey }) => ({ name, columns, primaryKey })),
    foreignKeys: catalog.foreignKeys.map(({ childTable, parentTable, constraintName, deferrable, childColumns, parentColumns }) => ({
      childTable, parentTable, constraintName, deferrable, childColumns, parentColumns
    }))
  }
  if (sha256(canonicalize(actual)) !== shape.shapeSha256) fail('DEV128_SOURCE_CATALOG_SHAPE_DRIFT')
  return shape.shapeSha256
}

function tupleKey(row, columns) { return canonicalize(columns.map((name) => row[name] ?? null)) }
function tableMetadata(catalog) {
  if (!catalog || !Array.isArray(catalog.tables) || !Array.isArray(catalog.foreignKeys)) fail('DEV128_SOURCE_CATALOG_INVALID')
  const map = new Map()
  for (const table of catalog.tables) {
    if (!safeName(table.name) || !Array.isArray(table.columns) || !Array.isArray(table.primaryKey) || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0) fail('DEV128_SOURCE_CATALOG_INVALID')
    if (map.has(table.name)) fail('DEV128_SOURCE_CATALOG_DUPLICATE')
    if (table.columns.some((column) => !safeName(column.name) || typeof column.type !== 'string' || typeof column.notNull !== 'boolean') || new Set(table.columns.map((column) => column.name)).size !== table.columns.length || table.primaryKey.some((column) => !table.columns.some((item) => item.name === column))) fail('DEV128_SOURCE_CATALOG_INVALID')
    map.set(table.name, { ...table, columnMap: new Map(table.columns.map((column) => [column.name, column])) })
  }
  for (const fk of catalog.foreignKeys) {
    if (!map.has(fk.childTable) || !map.has(fk.parentTable) || !Array.isArray(fk.childColumns) ||
        !Array.isArray(fk.parentColumns) || fk.childColumns.length !== fk.parentColumns.length ||
        fk.childColumns.some((column) => !map.get(fk.childTable).columnMap.has(column)) ||
        fk.parentColumns.some((column) => !map.get(fk.parentTable).columnMap.has(column))) fail('DEV128_SOURCE_CATALOG_FK_INVALID')
  }
  const catalogCore = { ...catalog }; delete catalogCore.catalogSha256
  if (!H64.test(catalog.catalogSha256 ?? '') || sha256(canonicalize(catalogCore)) !== catalog.catalogSha256) fail('DEV128_SOURCE_CATALOG_HASH_MISMATCH')
  return map
}

function makeOpaqueValue({ column, table, index, randomPrefix, special = null }) {
  const family = typeFamily(column?.type)
  if (special !== null) return special
  if (family === 'uuid') return crypto.randomUUID()
  if (family === 'integer') return 100000 + index
  if (family === 'numeric') return String(100000 + index)
  if (family !== 'text') fail('DEV128_UNSUPPORTED_KEY_TYPE')
  const limit = maxLength(column.type)
  const base = `m${randomPrefix}${index.toString(36)}`
  if (limit !== null && base.length > limit) {
    if (limit < 1) fail('DEV128_MASKED_VALUE_LENGTH_UNSUPPORTED')
    const short = `${index.toString(36)}${crypto.randomBytes(Math.max(2, limit)).toString('base64url').toLowerCase()}`.slice(0, limit)
    return short
  }
  return base
}

function prepareValueMaps({ config, catalog, rowsByTable, copyTables }) {
  const tables = tableMetadata(catalog)
  const skipped = asSet([...config.source.requireEmptyTables, ...(config.source.excludedTables ?? []), ...config.source.skipTables])
  const valueMaps = new Map()
  const nullFkColumns = new Set()
  const userKeys = new Map()
  const randomPrefix = crypto.randomBytes(5).toString('base64url').toLowerCase()
  const copied = new Set(copyTables)
  const activeForeignKeys = catalog.foreignKeys.filter((fk) => !skipped.has(fk.parentTable) && copied.has(fk.childTable))
  const nodes = new Map()
  const parents = new Map()
  const ensureNode = (tableName, columnName) => {
    const key = `${tableName}.${columnName}`
    if (!nodes.has(key)) {
      const table = tables.get(tableName)
      const column = table?.columnMap.get(columnName)
      if (!table || !column || !copied.has(tableName)) fail('DEV128_FOREIGN_KEY_MASK_NODE_INVALID')
      nodes.set(key, { key, tableName, columnName, column })
      parents.set(key, key)
    }
    return key
  }
  const find = (key) => {
    let root = key
    while (parents.get(root) !== root) root = parents.get(root)
    while (parents.get(key) !== key) {
      const next = parents.get(key)
      parents.set(key, root)
      key = next
    }
    return root
  }
  const union = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot === rightRoot) return
    if (leftRoot < rightRoot) parents.set(rightRoot, leftRoot)
    else parents.set(leftRoot, rightRoot)
  }

  for (const tableName of copyTables) {
    const table = tables.get(tableName)
    const rows = rowsByTable.get(tableName)
    if (!table || !Array.isArray(rows) || rows.length !== table.rowCount) fail('DEV128_SOURCE_ROW_COUNT_MISMATCH')
    if (rows.length > 0 && table.primaryKey.length === 0) fail('DEV128_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY')
    if (patternMatches(['(^|_)(auth|authentication|credential|secret|password|oauth|firebase_identity|account_session|account_recovery|account_invitation|employee_login|platform_principal|api_token)(_|$)'], tableName)) fail('DEV128_SENSITIVE_TABLE_NOT_EXCLUDED')
    for (const columnName of table.primaryKey) ensureNode(tableName, columnName)
  }
  for (const fk of activeForeignKeys) {
    for (let index = 0; index < fk.childColumns.length; index += 1) {
      union(ensureNode(fk.childTable, fk.childColumns[index]), ensureNode(fk.parentTable, fk.parentColumns[index]))
    }
  }

  const observedValues = new Map()
  for (const node of nodes.values()) {
    const values = new Map()
    for (const row of rowsByTable.get(node.tableName) ?? []) {
      const value = row[node.columnName]
      if (value === null || value === undefined) continue
      values.set(canonicalize(value instanceof Date ? value.toISOString() : value), value)
    }
    observedValues.set(node.key, values)
  }

  for (const fk of activeForeignKeys) {
    const parentTuples = new Set((rowsByTable.get(fk.parentTable) ?? []).map((row) => tupleKey(row, fk.parentColumns)))
    const childRows = rowsByTable.get(fk.childTable) ?? []
    for (const row of childRows) {
      const childValues = fk.childColumns.map((column) => row[column])
      if (childValues.some((value) => value === null || value === undefined)) continue
      if (!parentTuples.has(tupleKey(row, fk.childColumns))) fail('DEV128_FOREIGN_KEY_SOURCE_REFERENCE_MISSING')
    }
  }

  const groups = new Map()
  for (const node of nodes.values()) {
    const root = find(node.key)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(node)
  }
  for (const members of groups.values()) {
    const hasUserId = members.some((node) => node.tableName === 'users' && node.columnName === 'id')
    const hasCompanyId = members.some((node) => node.tableName === 'companies' && node.columnName === 'id')
    if (hasUserId && hasCompanyId) fail('DEV128_FOREIGN_KEY_SPECIAL_ID_CONFLICT')
    const ranked = [...members].sort((left, right) => {
      const specialRank = (node) => node.tableName === 'users' && node.columnName === 'id' ? 0
        : node.tableName === 'companies' && node.columnName === 'id' ? 1 : 2
      const rank = specialRank(left) - specialRank(right)
      if (rank !== 0) return rank
      const leftLimit = maxLength(left.column.type) ?? Number.MAX_SAFE_INTEGER
      const rightLimit = maxLength(right.column.type) ?? Number.MAX_SAFE_INTEGER
      return leftLimit - rightLimit || left.key.localeCompare(right.key)
    })
    const anchor = ranked[0]
    const sourceValues = new Map()
    for (const member of members) for (const [sourceKey, value] of observedValues.get(member.key)) if (!sourceValues.has(sourceKey)) sourceValues.set(sourceKey, value)
    const map = new Map()
    for (const [sourceKey, value] of sourceValues) {
      let targetValue = null
      if (hasUserId) {
        targetValue = `snapshot-user-${randomPrefix}-${String(map.size + 1).padStart(4, '0')}`
        userKeys.set(sourceKey, targetValue)
      } else if (hasCompanyId && String(value) === 'company-jenfu') targetValue = 'company-jenfu'
      else targetValue = makeOpaqueValue({ column: anchor.column, table: anchor.tableName, index: map.size + 1, randomPrefix })
      for (const member of members) {
        const limit = maxLength(member.column.type)
        if (limit !== null && String(targetValue).length > limit) {
          if (hasUserId) fail('DEV128_USER_ID_LENGTH_UNSUPPORTED')
          if (hasCompanyId) fail('DEV128_COMPANY_ID_LENGTH_UNSUPPORTED')
          fail('DEV128_MASKED_VALUE_LENGTH_UNSUPPORTED')
        }
      }
      if ([...map.values()].some((previous) => canonicalize(previous) === canonicalize(targetValue))) fail('DEV128_MASK_MAP_COLLISION')
      map.set(sourceKey, targetValue)
    }
    for (const member of members) valueMaps.set(member.key, map)
  }

  for (const fk of catalog.foreignKeys) {
    const skippedParent = skipped.has(fk.parentTable)
    if (!skippedParent || !copied.has(fk.childTable)) continue
    const childTable = tables.get(fk.childTable)
    const nullableColumns = fk.childColumns.filter((column) => childTable.columnMap.get(column)?.notNull !== true)
    if (nullableColumns.length === 0) {
      if (childTable.rowCount > 0) fail('DEV128_REQUIRED_REFERENCE_TO_EXCLUDED_TABLE')
      continue
    }
    nullFkColumns.add(`${fk.childTable}.${nullableColumns[0]}`)
  }
  return { tables, valueMaps, userKeys, randomPrefix, nullFkColumns }
}

function lookupMappedValue(valueMaps, tableName, columnName, value) {
  if (value === null || value === undefined) return value
  const map = valueMaps.get(`${tableName}.${columnName}`)
  if (!map) return undefined
  return map.get(canonicalize(value instanceof Date ? value.toISOString() : value))
}

function tokenForString({ config, tableName, columnName, value, column, rowIndex, randomPrefix, stringMaps }) {
  const lower = String(columnName).toLowerCase()
  if (!patternMatches(config.masking.sensitiveColumnPatterns, lower) && !patternMatches(config.masking.freeTextColumnPatterns, lower) && patternMatches(config.masking.safeEnumColumnPatterns, lower)) {
    const allowed = new Set(config.masking.safeEnumValues.map((item) => item.toLowerCase()))
    if (allowed.has(value.toLowerCase())) return value
  }
  const category = patternMatches(['email|login_identifier'], lower) ? 'email'
    : patternMatches(['phone|mobile|telephone'], lower) ? 'phone'
      : patternMatches(['name|person|contact'], lower) ? 'name'
        : patternMatches(['drawing|part|serial|order|invoice|number|code|reference'], lower) ? 'business-key'
          : `text-${lower}`
  const mapKey = `${category}\u001f${String(value)}`
  if (!stringMaps.has(mapKey)) stringMaps.set(mapKey, stringMaps.size + 1)
  const ordinal = stringMaps.get(mapKey)
  const limit = maxLength(column?.type)
  let token
  if (typeFamily(column?.type) === 'uuid') token = crypto.randomUUID()
  else if (category === 'email') token = `masked-${randomPrefix}-${String(ordinal).padStart(4, '0')}@example.invalid`
  else if (category === 'phone') token = `000000${randomPrefix.slice(0, 3)}${String(ordinal).padStart(3, '0')}`
  else if (category === 'name') token = `Local User ${randomPrefix.slice(0, 3)}-${String(ordinal).padStart(4, '0')}`
  else if (category === 'business-key') token = `Local-${randomPrefix.slice(0, 3)}-${String(ordinal).padStart(4, '0')}`
  else token = `Masked-${randomPrefix.slice(0, 3)}-${String(ordinal).padStart(4, '0')}`
  if (limit !== null && token.length > limit) {
    if (category === 'email') {
      const suffix = '@example.invalid'
      if (limit <= suffix.length) fail('DEV128_EMAIL_COLUMN_TOO_SHORT')
      token = `m${randomPrefix.slice(0, Math.min(randomPrefix.length, limit - suffix.length - 1))}${ordinal.toString(36)}`.slice(0, limit - suffix.length) + suffix
    } else token = `m${randomPrefix.slice(0, Math.max(0, limit - 1))}${ordinal.toString(36)}`.slice(0, Math.max(1, limit))
  }
  if (tableName === 'users' && lower === 'display_name') token = `Local User ${randomPrefix.slice(0, 3)}-${String(rowIndex + 1).padStart(4, '0')}`
  if (tableName === 'users' && (lower === 'email' || lower === 'email_normalized' || lower === 'login_identifier')) token = `masked-${randomPrefix}-${String(rowIndex + 1).padStart(4, '0')}@example.invalid`
  return token
}

function sanitizeJsonValue(value, { config, tableName, columnName, rowIndex, stringMaps, userKeys, randomPrefix }, key = '') {
  if (HARD_SECRET.test(key) || patternMatches(['(^|_)(password|secret|token|credential|provider_subject|firebase_uid|firebase_id|ip_address|ip_hash)(_|$)'], key)) return null
  if (isPlainObject(value) && Object.keys(value).length === 1 && Object.hasOwn(value, LOSSLESS_NUMBER_KEY)) {
    const number = value[LOSSLESS_NUMBER_KEY]
    if (typeof number !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(number)) fail('DEV128_LOSSLESS_NUMBER_INVALID')
    if (patternMatches(config.masking.sensitiveColumnPatterns, key)) return null
    return { [LOSSLESS_NUMBER_KEY]: number }
  }
  if (value === null || value === undefined || typeof value === 'boolean') return value
  const mappedUser = USER_REFERENCE.test(key) ? userKeys.get(canonicalize(value)) : undefined
  if (mappedUser) return mappedUser
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return null
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item, { config, tableName, columnName, rowIndex, stringMaps, userKeys, randomPrefix }, key))
  if (isPlainObject(value)) {
    const result = {}
    const safeKeys = new Set(config.masking.safeJsonKeys)
    const observedKeys = new Set()
    for (const [childKey, childValue] of Object.entries(value)) {
      EMAIL.lastIndex = 0
      if (EMAIL.test(childKey) || ABSOLUTE_PATH.test(childKey)) fail('DEV128_JSON_KEY_SCAN_FAILED')
      EMAIL.lastIndex = 0
      const maskedKey = safeKeys.has(childKey)
        ? childKey
        : `masked_key_${crypto.createHash('sha256').update(`${randomPrefix}:${childKey}`).digest('hex').slice(0, 20)}`
      if (observedKeys.has(maskedKey)) fail('DEV128_JSON_KEY_COLLISION')
      observedKeys.add(maskedKey)
      result[maskedKey] = sanitizeJsonValue(childValue, { config, tableName, columnName, rowIndex, stringMaps, userKeys, randomPrefix }, childKey)
    }
    return result
  }
  const text = String(value)
  const pseudo = tokenForString({ config, tableName, columnName: key || columnName, value: text, column: null, rowIndex, randomPrefix, stringMaps })
  if (EMAIL.test(pseudo) && !pseudo.endsWith('@example.invalid')) fail('DEV128_EMAIL_MASK_FAILED')
  EMAIL.lastIndex = 0
  return pseudo
}

function copyBusinessJsonValue(value, key = '', { stripExternalPointers = false } = {}) {
  if (HARD_SECRET.test(key) || patternMatches(['(^|_)(password|secret|token|credential|provider_subject|firebase_uid|firebase_id|ip_address|ip_hash)(_|$)'], key)) return null
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (stripExternalPointers && (ABSOLUTE_PATH.test(value) || /^(?:gs|https?|s3):\/\//iu.test(value))) return null
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return null
  if (Array.isArray(value)) return value.map((item) => copyBusinessJsonValue(item, key, { stripExternalPointers }))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, copyBusinessJsonValue(childValue, childKey, { stripExternalPointers })]))
  fail('DEV128_BUSINESS_VALUE_INVALID')
}

function copyBusinessRow({ config, tableName, row, metadata, context }) {
  const result = {}
  const fileTables = asSet(config.source.fileTables)
  for (const [columnName, original] of Object.entries(row)) {
    const column = metadata.columnMap.get(columnName)
    if (!column) fail('DEV128_SOURCE_ROW_COLUMN_DRIFT')
    const value = original instanceof Date ? original.toISOString() : original
    if (value === null || value === undefined) { result[columnName] = null; continue }
    if (context.nullFkColumns.has(`${tableName}.${columnName}`)) { result[columnName] = null; continue }
    if (HARD_SECRET.test(columnName)) {
      if (column.notNull) fail('DEV128_REQUIRED_SECRET_FIELD')
      result[columnName] = null
      continue
    }
    if (fileTables.has(tableName)) {
      const lower = columnName.toLowerCase()
      if (/storage_bucket/u.test(lower)) { result[columnName] = column.notNull ? 'local-business-copy' : null; continue }
      if (/(^|_)(uri|url)(_|$)/u.test(lower)) { result[columnName] = column.notNull ? 'local-business-copy-unavailable' : null; continue }
      if (/local_path|object_key|storage_key/iu.test(lower)) { result[columnName] = `local-business-copy-not-exported/${tableName}`; continue }
      if (/filename|file_name/iu.test(lower)) { result[columnName] = String(value); continue }
      if (/bytes|blob|binary|content_data|file_data|body/u.test(lower)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
      if (Buffer.isBuffer(value)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
    }
    if (Buffer.isBuffer(value)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
    if (typeof value === 'object') { result[columnName] = copyBusinessJsonValue(value, columnName, { stripExternalPointers: fileTables.has(tableName) }); continue }
    result[columnName] = value
  }
  return result
}

function sanitizeRow({ config, tableName, row, rowIndex, metadata, context, stringMaps }) {
  const result = {}
  const fileTables = asSet(config.source.fileTables)
  for (const [columnName, original] of Object.entries(row)) {
    const column = metadata.columnMap.get(columnName)
    if (!column) fail('DEV128_SOURCE_ROW_COLUMN_DRIFT')
    const value = original instanceof Date ? original.toISOString() : original
    if (value === null || value === undefined) { result[columnName] = null; continue }
    if (context.nullFkColumns.has(`${tableName}.${columnName}`)) { result[columnName] = null; continue }
    const mapped = lookupMappedValue(context.valueMaps, tableName, columnName, value)
    if (mapped !== undefined) { result[columnName] = mapped; continue }
    const mappedUser = USER_REFERENCE.test(columnName) ? context.userKeys.get(canonicalize(value)) : undefined
    if (mappedUser) { result[columnName] = mappedUser; continue }
    if (/sha256|checksum|fingerprint|content_hash|ledger_entry_hash/iu.test(columnName)) {
      result[columnName] = crypto.createHash('sha256').update(`${context.randomPrefix}:${tableName}:${columnName}:${rowIndex}`).digest('hex')
      continue
    }
    if (fileTables.has(tableName)) {
      const lower = columnName.toLowerCase()
      if (/storage_bucket/u.test(lower)) { result[columnName] = column.notNull ? 'masked-local-snapshot' : null; continue }
      if (/(^|_)(uri|url)(_|$)/u.test(lower)) { result[columnName] = column.notNull ? `masked-unavailable-${context.randomPrefix}-${rowIndex + 1}` : null; continue }
      if (/local_path|object_key|storage_key/iu.test(lower)) { result[columnName] = `masked-snapshot-not-exported/${tableName}/${rowIndex + 1}`; continue }
      if (/filename|file_name/iu.test(lower)) { result[columnName] = `masked-file-${rowIndex + 1}`; continue }
      if (/bytes|blob|binary|content_data|file_data|body/u.test(lower)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
      if (/sha256|checksum|fingerprint|content_hash|ledger_entry_hash/u.test(lower)) { result[columnName] = crypto.createHash('sha256').update(`${context.randomPrefix}:${tableName}:${columnName}:${rowIndex}`).digest('hex'); continue }
      if (Buffer.isBuffer(value)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
    }
    if (Buffer.isBuffer(value)) { result[columnName] = column.notNull && typeFamily(column.type) === 'binary' ? '\\x' : null; continue }
    if (typeof value === 'string') {
      if (HARD_SECRET.test(columnName)) {
        if (column.notNull) fail('DEV128_REQUIRED_SECRET_FIELD')
        result[columnName] = null
        continue
      }
      if (typeFamily(column.type) === 'temporal' || (typeFamily(column.type) === 'numeric' && /^-?(?:\d+\.?\d*|\.\d+)$/u.test(value))) { result[columnName] = value; continue }
      const token = tokenForString({ config, tableName, columnName, value, column, rowIndex, randomPrefix: context.randomPrefix, stringMaps })
      if (EMAIL.test(token) && !token.endsWith('@example.invalid')) fail('DEV128_EMAIL_MASK_FAILED')
      EMAIL.lastIndex = 0
      if (ABSOLUTE_PATH.test(token)) fail('DEV128_PATH_MASK_FAILED')
      result[columnName] = token
      continue
    }
    if (isPlainObject(value) && Object.keys(value).length === 1 && Object.hasOwn(value, LOSSLESS_NUMBER_KEY) && patternMatches(config.masking.sensitiveColumnPatterns, columnName)) {
      if (column.notNull) fail('DEV128_REQUIRED_SENSITIVE_NUMERIC_FIELD')
      result[columnName] = null
      continue
    }
    if (typeof value === 'object') {
      result[columnName] = sanitizeJsonValue(value, { config, tableName, columnName, rowIndex, stringMaps, userKeys: context.userKeys, randomPrefix: context.randomPrefix })
      continue
    }
    if (patternMatches(config.masking.sensitiveColumnPatterns, columnName) && typeof value === 'number') {
      if (column.notNull) fail('DEV128_REQUIRED_SENSITIVE_NUMERIC_FIELD')
      result[columnName] = null
      continue
    }
    if (typeof value === 'number' && HARD_SECRET.test(columnName)) {
      if (column.notNull) fail('DEV128_REQUIRED_SECRET_FIELD')
      result[columnName] = null
      continue
    }
    result[columnName] = value
  }
  return result
}

function assertNoSensitivePayload(config, payload, rawUserIds) {
  EMAIL.lastIndex = 0
  const rawUserKeys = new Set(rawUserIds.map((value) => canonicalize(value)))
  let emailFindings = 0; let rawUserIdFindings = 0; let binaryFindings = 0
  const inspectValue = (value, path) => {
    if (Buffer.isBuffer(value)) { binaryFindings += 1; fail('DEV128_BINARY_SCAN_FAILED') }
    const leaf = path.split('.').at(-1) ?? ''
    if (HARD_SECRET.test(leaf) && value !== null && value !== '') fail('DEV128_SENSITIVE_FIELD_SCAN_FAILED')
    if (typeof value === 'string') {
      if (config.masking.businessDataPolicy !== 'COPY_AS_IS') {
        EMAIL.lastIndex = 0
        const emails = value.match(EMAIL) ?? []
        if (emails.some((item) => !item.endsWith('@example.invalid'))) { emailFindings += 1; fail('DEV128_EMAIL_SCAN_FAILED') }
        PHONE.lastIndex = 0
        const losslessNumber = leaf === LOSSLESS_NUMBER_KEY && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(value)
        if (PHONE.test(value) && !losslessNumber && !UUID.test(value) && !/^[0-9]+$/u.test(value) && !/^[a-f0-9]{32,64}$/iu.test(value) && !/(sha256|checksum|fingerprint)$/iu.test(leaf)) fail('DEV128_PHONE_SCAN_FAILED')
        PHONE.lastIndex = 0
        if (ABSOLUTE_PATH.test(value)) fail('DEV128_PATH_SCAN_FAILED')
      }
    }
    if (config.masking.businessDataPolicy !== 'COPY_AS_IS' && rawUserKeys.has(canonicalize(value)) && USER_REFERENCE.test(leaf)) {
      rawUserIdFindings += 1; fail('DEV128_RAW_USER_ID_SCAN_FAILED')
    }
    if (Array.isArray(value)) value.forEach((item, index) => inspectValue(item, `${path}.${index}`))
    else if (isPlainObject(value)) for (const [key, item] of Object.entries(value)) {
      if (config.masking.businessDataPolicy !== 'COPY_AS_IS' && rawUserKeys.has(canonicalize(key))) fail('DEV128_RAW_USER_ID_SCAN_FAILED')
      inspectValue(item, `${path}.${key}`)
    }
  }
  for (const table of payload.tables) {
    for (const row of table.rows) {
      for (const [columnName, value] of Object.entries(row)) {
        if (HARD_SECRET.test(columnName) && value !== null && value !== '') fail('DEV128_SENSITIVE_FIELD_SCAN_FAILED')
        inspectValue(value, `${table.name}.${columnName}`)
      }
    }
  }
  const serialized = canonicalize(payload)
  return { serializedBytes: Buffer.byteLength(serialized), emailFindings, rawUserIdFindings, binaryFindings }
}

export function createMaskedSnapshotPayload({ config: configInput, snapshotId, sourceRevision, sourceCatalog, rowsByTable }) {
  const config = assertMaskedSnapshotConfig(configInput)
  if (!SNAPSHOT_ID.test(snapshotId ?? '') || !H40.test(sourceRevision ?? '') || !rowsByTable || !(rowsByTable instanceof Map)) fail('DEV128_EXPORT_INPUT_INVALID')
  const metadata = tableMetadata(sourceCatalog)
  if (metadata.size !== config.source.expectedTableCount) fail('DEV128_SOURCE_TABLE_COUNT_DRIFT')
  const requiredEmpty = asSet(config.source.requireEmptyTables)
  for (const tableName of requiredEmpty) {
    const table = metadata.get(tableName)
    if (!table || table.rowCount !== 0) fail('DEV128_REQUIRED_EMPTY_TABLE_NOT_EMPTY')
  }
  const excludedTables = asSet(config.source.excludedTables ?? [])
  for (const tableName of excludedTables) if (!metadata.has(tableName)) fail('DEV128_EXCLUDED_TABLE_MISSING')
  for (const tableName of config.source.skipTables) if (!metadata.has(tableName)) fail('DEV128_SENSITIVE_TABLE_MISSING')
  const copyTables = sourceCatalog.tables.filter((table) => !requiredEmpty.has(table.name) && !excludedTables.has(table.name)).map((table) => table.name).sort()
  if (copyTables.length !== config.source.expectedCopyTableCount) fail('DEV128_COPY_TABLE_COUNT_DRIFT')
  const skipped = asSet(config.source.skipTables)
  const outputTables = copyTables.filter((tableName) => !skipped.has(tableName))
  if (outputTables.length !== copyTables.length - config.source.skipTables.length) fail('DEV128_OUTPUT_TABLE_COUNT_DRIFT')
  for (const tableName of outputTables) if (!rowsByTable.has(tableName)) fail('DEV128_SOURCE_TABLE_MISSING')
  const totalRows = outputTables.reduce((sum, tableName) => sum + rowsByTable.get(tableName).length, 0)
  if (totalRows > config.source.maxRows) fail('DEV128_ROW_LIMIT_EXCEEDED')
  const context = prepareValueMaps({ config, catalog: sourceCatalog, rowsByTable, copyTables: outputTables })
  const stringMaps = new Map()
  const tables = outputTables.map((name) => {
    const table = context.tables.get(name)
    const rows = rowsByTable.get(name).map((row, index) => config.masking.businessDataPolicy === 'COPY_AS_IS'
      ? copyBusinessRow({ config, tableName: name, row, metadata: table, context })
      : sanitizeRow({ config, tableName: name, row, rowIndex: index, metadata: table, context, stringMaps }))
    return { name, primaryKey: table.primaryKey, rowCount: rows.length, rows }
  })
  const rawUserIds = (rowsByTable.get('users') ?? []).map((row) => row.id).filter((value) => value !== null && value !== undefined)
  const core = {
    schemaVersion: 'jenfu.dev128.ai-pdm-masked-local-snapshot.v1',
    ownerApplicationId: 'ai-pdm',
    snapshotId,
    sourceRevision,
    source: { projectId: config.source.projectId, database: config.source.database, schema: config.source.schema, catalogShapeSha256: config.source.catalogShapeSha256, catalogSha256: sourceCatalog.catalogSha256, catalog: (() => { const value = { ...sourceCatalog }; delete value.catalogSha256; return value })(), tableCount: metadata.size, copiedTableCount: outputTables.length, skippedTableCount: copyTables.length - outputTables.length, rowCount: totalRows },
    masking: {
      policyVersion: config.masking.policyVersion,
      policySha256: sha256(canonicalize(config.masking)),
      businessDataCopiedAsIs: config.masking.businessDataPolicy === 'COPY_AS_IS',
      credentialDataExported: false,
      identityMapRetained: false,
      fileBytesExported: false
    },
    tables
  }
  const payload = { ...core, payloadSha256: sha256(canonicalize(core)) }
  const scan = assertNoSensitivePayload(config, payload, rawUserIds)
  if (scan.serializedBytes > config.source.maxUncompressedBytes) fail('DEV128_PLAINTEXT_SIZE_LIMIT_EXCEEDED')
  return { payload, scan }
}

export function assertMaskedSnapshotPayload({ config: configInput, payload, expectedSourceRevision = null }) {
  const config = assertMaskedSnapshotConfig(configInput)
  if (!payload || payload.schemaVersion !== 'jenfu.dev128.ai-pdm-masked-local-snapshot.v1' || payload.ownerApplicationId !== 'ai-pdm' || !SNAPSHOT_ID.test(payload.snapshotId ?? '') || !H40.test(payload.sourceRevision ?? '') || (expectedSourceRevision && payload.sourceRevision !== expectedSourceRevision)) fail('DEV128_PAYLOAD_INVALID')
  const core = { ...payload }; delete core.payloadSha256
  if (!H64.test(payload.payloadSha256 ?? '') || sha256(canonicalize(core)) !== payload.payloadSha256) fail('DEV128_PAYLOAD_HASH_MISMATCH')
  if (payload.source?.projectId !== config.source.projectId || payload.source?.database !== config.source.database || payload.source?.schema !== config.source.schema || payload.source?.catalogShapeSha256 !== config.source.catalogShapeSha256 || payload.source?.tableCount !== config.source.expectedTableCount || !H64.test(payload.source.catalogSha256 ?? '') || !payload.source.catalog || payload.source.catalog.schema !== config.source.schema || payload.source.catalog.database !== config.source.database || !Array.isArray(payload.source.catalog.tables) || !Array.isArray(payload.source.catalog.foreignKeys) || payload.source.catalog.tables.length !== payload.source.tableCount || sha256(canonicalize(payload.source.catalog)) !== payload.source.catalogSha256 || payload.masking?.policyVersion !== config.masking.policyVersion || payload.masking?.policySha256 !== sha256(canonicalize(config.masking)) || payload.masking?.businessDataCopiedAsIs !== (config.masking.businessDataPolicy === 'COPY_AS_IS') || payload.masking?.credentialDataExported !== false || payload.masking?.identityMapRetained !== false || payload.masking?.fileBytesExported !== false || !Array.isArray(payload.tables) || !Number.isSafeInteger(payload.source.copiedTableCount) || payload.source.copiedTableCount !== payload.tables.length || !Number.isSafeInteger(payload.source.skippedTableCount) || payload.source.copiedTableCount + payload.source.skippedTableCount !== config.source.expectedCopyTableCount) fail('DEV128_PAYLOAD_METADATA_INVALID')
  const skipped = asSet(config.source.skipTables)
  const excluded = asSet([...config.source.requireEmptyTables, ...config.source.excludedTables])
  const names = payload.tables.map((table) => table?.name)
  if (names.some((name) => !safeName(name) || skipped.has(name) || excluded.has(name)) || new Set(names).size !== names.length || names.some((name, index) => index > 0 && names[index - 1] >= name) || names.length !== config.source.expectedCopyTableCount - config.source.skipTables.length) fail('DEV128_PAYLOAD_TABLE_SET_INVALID')
  const expectedOutput = payload.source.catalog.tables.map((table) => table.name).filter((name) => !excluded.has(name) && !skipped.has(name)).sort()
  if (canonicalize(names) !== canonicalize(expectedOutput)) fail('DEV128_PAYLOAD_TABLE_SET_INVALID')
  const catalogTables = tableMetadata({ ...payload.source.catalog, catalogSha256: payload.source.catalogSha256 })
  let rows = 0
  for (const table of payload.tables) {
    if (!Array.isArray(table.primaryKey) || !Array.isArray(table.rows) || table.rowCount !== table.rows.length || table.primaryKey.some((column) => !safeName(column))) fail('DEV128_PAYLOAD_TABLE_INVALID')
    const catalogTable = catalogTables.get(table.name)
    if (!catalogTable || canonicalize(table.primaryKey) !== canonicalize(catalogTable.primaryKey) || catalogTable.rowCount !== table.rowCount) fail('DEV128_PAYLOAD_TABLE_CATALOG_MISMATCH')
    for (const row of table.rows) if (canonicalize(Object.keys(row).sort()) !== canonicalize(catalogTable.columns.map((column) => column.name).sort())) fail('DEV128_PAYLOAD_ROW_COLUMN_SET_INVALID')
    rows += table.rows.length
    for (const row of table.rows) {
      if (!isPlainObject(row) || table.primaryKey.some((column) => row[column] === null || row[column] === undefined)) fail('DEV128_PAYLOAD_ROW_INVALID')
    }
  }
  if (!Number.isSafeInteger(payload.source.rowCount) || rows !== payload.source.rowCount || rows > config.source.maxRows) fail('DEV128_PAYLOAD_ROW_COUNT_INVALID')
  assertNoSensitivePayload(config, payload, [])
  return payload
}

function normalizePublicKey(publicKeyPem) {
  let key
  try { key = crypto.createPublicKey(publicKeyPem) } catch { fail('DEV128_RECIPIENT_PUBLIC_KEY_INVALID') }
  if (key.asymmetricKeyType !== 'rsa' || Number(key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) fail('DEV128_RECIPIENT_PUBLIC_KEY_INVALID')
  return key
}

export function recipientKeyIdForPublicKey(publicKeyPem) {
  return sha256(normalizePublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }))
}

export function encryptMaskedSnapshot({ payload, publicKeyPem, maxEncryptedBytes }) {
  if (!payload || payload.schemaVersion !== 'jenfu.dev128.ai-pdm-masked-local-snapshot.v1' || !H64.test(payload.payloadSha256 ?? '')) fail('DEV128_PAYLOAD_INVALID')
  const publicKey = normalizePublicKey(publicKeyPem)
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  const keyId = sha256(publicDer)
  const aesKey = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  try {
    const clear = gzipSync(Buffer.from(`${canonicalize(payload)}\n`, 'utf8'), { level: 9, mtime: 0 })
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv)
    const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()])
    const wrappedKey = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey)
    const envelope = {
      schemaVersion: 'jenfu.dev128.encrypted-masked-local-snapshot.v1',
      snapshotId: payload.snapshotId,
      keyId,
      algorithm: 'RSA-OAEP-SHA256+A256GCM',
      wrappedKey: wrappedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
    const bytes = Buffer.from(`${canonicalize(envelope)}\n`, 'utf8')
    if (bytes.length > maxEncryptedBytes) fail('DEV128_ENCRYPTED_SIZE_LIMIT_EXCEEDED')
    return { bytes, keyId, ciphertextSha256: sha256(bytes), encryptedBytes: bytes.length }
  } finally { aesKey.fill(0) }
}

function decodeCanonicalBase64(value, code) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail(code)
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) fail(code)
  return decoded
}

export function decryptMaskedSnapshot({ bytes, privateKeyPem, expectedKeyId, maxEncryptedBytes, maxUncompressedBytes }) {
  if (!Buffer.isBuffer(bytes) || !Number.isSafeInteger(maxEncryptedBytes) || bytes.length > maxEncryptedBytes || !Number.isSafeInteger(maxUncompressedBytes) || maxUncompressedBytes < 1) fail('DEV128_ENCRYPTED_SIZE_LIMIT_EXCEEDED')
  let envelope
  try { envelope = JSON.parse(Buffer.from(bytes).toString('utf8')) } catch { fail('DEV128_ENVELOPE_INVALID') }
  const keys = Object.keys(envelope ?? {}).sort()
  if (canonicalize(keys) !== canonicalize(['algorithm', 'ciphertext', 'iv', 'keyId', 'schemaVersion', 'snapshotId', 'tag', 'wrappedKey'].sort()) ||
      envelope.schemaVersion !== 'jenfu.dev128.encrypted-masked-local-snapshot.v1' ||
      envelope.algorithm !== 'RSA-OAEP-SHA256+A256GCM' || !SNAPSHOT_ID.test(envelope.snapshotId ?? '') || !H64.test(envelope.keyId ?? '')) fail('DEV128_ENVELOPE_INVALID')
  let privateKey
  try { privateKey = crypto.createPrivateKey(privateKeyPem) } catch { fail('DEV128_PRIVATE_KEY_INVALID') }
  if (privateKey.asymmetricKeyType !== 'rsa' || Number(privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) fail('DEV128_PRIVATE_KEY_INVALID')
  const publicDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
  const keyId = sha256(publicDer)
  if (keyId !== envelope.keyId || (expectedKeyId && keyId !== expectedKeyId)) fail('DEV128_RECIPIENT_KEY_MISMATCH')
  let clear
  let aesKey
  try {
    const wrappedKey = decodeCanonicalBase64(envelope.wrappedKey, 'DEV128_ENVELOPE_INVALID')
    const iv = decodeCanonicalBase64(envelope.iv, 'DEV128_ENVELOPE_INVALID')
    const tag = decodeCanonicalBase64(envelope.tag, 'DEV128_ENVELOPE_INVALID')
    const ciphertext = decodeCanonicalBase64(envelope.ciphertext, 'DEV128_ENVELOPE_INVALID')
    if (iv.length !== 12 || tag.length !== 16 || wrappedKey.length !== Math.ceil(Number(privateKey.asymmetricKeyDetails.modulusLength) / 8) || ciphertext.length < 1 || ciphertext.length > maxEncryptedBytes) fail('DEV128_ENVELOPE_INVALID')
    aesKey = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrappedKey)
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv)
    decipher.setAuthTag(tag)
    clear = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch { fail('DEV128_DECRYPTION_FAILED') }
  finally { aesKey?.fill(0) }
  if (clear.length > maxUncompressedBytes) fail('DEV128_PLAINTEXT_SIZE_LIMIT_EXCEEDED')
  let payload
  try { payload = JSON.parse(gunzipSync(clear, { maxOutputLength: maxUncompressedBytes }).toString('utf8')) } catch { fail('DEV128_DECRYPTED_PAYLOAD_INVALID') }
  const core = { ...payload }; delete core.payloadSha256
  if (payload.schemaVersion !== 'jenfu.dev128.ai-pdm-masked-local-snapshot.v1' || payload.snapshotId !== envelope.snapshotId ||
      !H40.test(payload.sourceRevision ?? '') || !H64.test(payload.payloadSha256 ?? '') || sha256(canonicalize(core)) !== payload.payloadSha256) fail('DEV128_PAYLOAD_HASH_MISMATCH')
  return payload
}
