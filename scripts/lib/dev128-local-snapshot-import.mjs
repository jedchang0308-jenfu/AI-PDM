import { canonicalize, sha256, topologicalTableOrder } from './dev012-production-data-cutover.mjs'

const NUMBER_KEY = '__dev128_number_v1__'
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/u
const TRANSFORM_TABLES = Object.freeze([])

function fail(code) { const error = new Error(code); error.code = code; throw error }
function isNumberMarker(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && Object.hasOwn(value, NUMBER_KEY) }

export function quoteDev128Identifier(value) {
  if (!SAFE_NAME.test(value ?? '')) fail('DEV128_IDENTIFIER_INVALID')
  return `"${value}"`
}

export function losslessCanonicalJson(value) {
  if (isNumberMarker(value)) {
    const number = value[NUMBER_KEY]
    if (typeof number !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(number)) fail('DEV128_LOSSLESS_NUMBER_INVALID')
    return number
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(losslessCanonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${losslessCanonicalJson(value[key])}`).join(',')}}`
}

function transformRow(row, tableName, targetTable, transformMap) {
  const result = structuredClone(row)
  for (const rule of transformMap.values()) {
    if (rule.table !== tableName || result[rule.column] == null) continue
    if (rule.mode === 'JSONB_TO_CANONICAL_TEXT') result[rule.column] = losslessCanonicalJson(result[rule.column])
    else if (rule.mode === 'TIMESTAMPTZ_TO_TEXT') result[rule.column] = String(result[rule.column])
    else fail('DEV128_TYPE_TRANSFORM_INVALID')
  }
  return result
}

function normalizedForeignKeys(catalog, childSet, parentSet) {
  return catalog.foreignKeys
    .filter((fk) => childSet.has(fk.childTable) && parentSet.has(fk.parentTable))
    .map(({ childTable, parentTable, deferrable, childColumns, parentColumns }) => ({ childTable, parentTable, deferrable, childColumns, parentColumns }))
    .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)))
}

export function assertSnapshotTargetCompatible({ payload, targetCatalog }) {
  if (!payload?.source?.catalog || !targetCatalog || targetCatalog.schema !== 'ai_pdm_core') fail('DEV128_TARGET_CATALOG_INVALID')
  const sourceTables = new Map(payload.source.catalog.tables.map((table) => [table.name, table]))
  const targetTables = new Map(targetCatalog.tables.map((table) => [table.name, table]))
  const outputNames = payload.tables.map((table) => table.name)
  const outputSet = new Set(outputNames)
  const sourceSet = new Set(sourceTables.keys())
  const observedTransforms = new Set()
  const expectedTransforms = new Map(TRANSFORM_TABLES.map((rule) => [`${rule.table}.${rule.column}`, rule]))
  for (const name of outputNames) {
    const source = sourceTables.get(name)
    const target = targetTables.get(name)
    if (!source || !target) fail('DEV128_TARGET_TABLE_MISSING')
    if (canonicalize(source.columns.map((column) => column.name).sort()) !== canonicalize(target.columns.map((column) => column.name).sort()) ||
        canonicalize(source.primaryKey) !== canonicalize(target.primaryKey)) fail('DEV128_TARGET_TABLE_STRUCTURE_MISMATCH')
    const targetColumnMap = new Map(target.columns.map((column) => [column.name, column]))
    for (const sourceColumn of source.columns) {
      const targetColumn = targetColumnMap.get(sourceColumn.name)
      for (const field of ['notNull', 'hasDefault', 'generated', 'identity']) {
        if (sourceColumn[field] !== targetColumn[field]) fail('DEV128_TARGET_COLUMN_METADATA_MISMATCH')
      }
      if (sourceColumn.identity || targetColumn.identity) fail('DEV128_IDENTITY_COLUMN_UNSUPPORTED')
      if (sourceColumn.type !== targetColumn.type) fail('DEV128_TARGET_COLUMN_TYPE_MISMATCH')
    }
  }
  if (canonicalize([...observedTransforms].sort()) !== canonicalize([...expectedTransforms.keys()].sort())) fail('DEV128_TYPE_TRANSFORM_SET_MISMATCH')
  const sourceFks = normalizedForeignKeys(payload.source.catalog, outputSet, sourceSet)
  const targetFks = normalizedForeignKeys(targetCatalog, outputSet, sourceSet)
  if (targetCatalog.foreignKeys.some((fk) => outputSet.has(fk.childTable) && !sourceSet.has(fk.parentTable))) fail('DEV128_UNEXPECTED_LOCAL_FOREIGN_KEY')
  if (canonicalize(sourceFks) !== canonicalize(targetFks)) fail('DEV128_TARGET_FOREIGN_KEY_SET_MISMATCH')
  return { outputNames, targetCatalog, sourceForeignKeyCount: sourceFks.length }
}

function insertSql(schema, table) {
  const insertable = table.columns.filter((column) => !column.generated && !column.identity).map((column) => column.name)
  if (!insertable.length) fail('DEV128_TABLE_HAS_NO_INSERTABLE_COLUMNS')
  const names = insertable.map(quoteDev128Identifier).join(',')
  const values = insertable.map((_, index) => `$${index + 1}`).join(',')
  const primaryKey = table.primaryKey.map(quoteDev128Identifier)
  if (!primaryKey.length) fail('DEV128_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY')
  const mutable = insertable.filter((column) => !table.primaryKey.includes(column))
  const conflict = mutable.length ? `DO UPDATE SET ${mutable.map((column) => `${quoteDev128Identifier(column)}=EXCLUDED.${quoteDev128Identifier(column)}`).join(',')}` : 'DO NOTHING'
  return { sql: `INSERT INTO ${quoteDev128Identifier(schema)}.${quoteDev128Identifier(table.name)} (${names}) VALUES (${values}) ON CONFLICT (${primaryKey.join(',')}) ${conflict}`, insertable }
}

function dbValue(value, column) {
  if (value === null || value === undefined) return null
  if (isNumberMarker(value)) return value[NUMBER_KEY]
  if (column.type === 'jsonb' || column.type === 'json') return losslessCanonicalJson(value)
  if (Array.isArray(value)) return value.map((item) => dbValue(item, { type: column.type.replace(/\[\]$/u, '') }))
  if (typeof value === 'object') fail('DEV128_UNEXPECTED_OBJECT_COLUMN_VALUE')
  return value
}

export async function insertSnapshotTableRows(database, schema, targetTable, rows) {
  if (rows.length === 0) return 0
  const { sql, insertable } = insertSql(schema, targetTable)
  let pending = [...rows]
  let inserted = 0
  for (let round = 0; pending.length > 0; round += 1) {
    const next = []
    let progress = 0
    for (const row of pending) {
      await database.query('SAVEPOINT dev128_row_insert')
      try {
        const values = insertable.map((name) => dbValue(row[name], targetTable.columns.find((column) => column.name === name)))
        const result = await database.query(sql, values)
        await database.query('RELEASE SAVEPOINT dev128_row_insert')
        inserted += result.rowCount ?? 0
        progress += 1
      } catch (error) {
        await database.query('ROLLBACK TO SAVEPOINT dev128_row_insert')
        await database.query('RELEASE SAVEPOINT dev128_row_insert')
        if (error?.code === '23503') next.push(row)
        else fail('DEV128_TARGET_ROW_INSERT_FAILED')
      }
    }
    if (next.length > 0 && progress === 0) fail('DEV128_SELF_FOREIGN_KEY_DID_NOT_CONVERGE')
    pending = next
    if (round > rows.length) fail('DEV128_SELF_FOREIGN_KEY_DID_NOT_CONVERGE')
  }
  return inserted
}

export function buildImportOrder({ tableNames, foreignKeys, triggerDependencies = [] }) {
  return topologicalTableOrder(tableNames, [...foreignKeys, ...triggerDependencies])
}

export function transformSnapshotRows({ payload, targetTable, cutoverConfig }) {
  const table = payload.tables.find((item) => item.name === targetTable.name)
  if (!table || table.rowCount !== table.rows.length) fail('DEV128_PAYLOAD_TABLE_MISSING')
  const rules = new Map((cutoverConfig.catalog?.typeTransforms ?? TRANSFORM_TABLES).map((rule) => [`${rule.table}.${rule.column}`, rule]))
  return table.rows.map((row) => transformRow(row, targetTable.name, targetTable, rules))
}

export async function readSnapshotTableRows(database, schema, table) {
  if (!table.primaryKey.length) fail('DEV128_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY')
  const columns = table.columns.map((column) => column.name)
  const projection = columns.map((name) => quoteDev128Identifier(name)).join(',')
  const ordering = table.primaryKey.map(quoteDev128Identifier).join(',')
  const result = await database.query(`SELECT row_to_json(snapshot_row)::text AS row_text FROM (SELECT ${projection} FROM ${quoteDev128Identifier(schema)}.${quoteDev128Identifier(table.name)} ORDER BY ${ordering}) snapshot_row`)
  return result.rows.map((item) => parseLosslessJson(item.row_text))
}

export function parseLosslessJson(text) {
  let rewritten = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length;) {
    const character = text[index]
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
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(index))
      if (!match) fail('DEV128_TARGET_JSON_INVALID')
      rewritten += `{${JSON.stringify(NUMBER_KEY)}:${JSON.stringify(match[0])}}`
      index += match[0].length
      continue
    }
    rewritten += character
    index += 1
  }
  try { return JSON.parse(rewritten) } catch { fail('DEV128_TARGET_JSON_INVALID') }
}

export function tableContentSha256(rows, primaryKey) {
  const ordered = [...rows].sort((left, right) => {
    for (const column of primaryKey) {
      const a = canonicalize(left[column]); const b = canonicalize(right[column])
      if (a < b) return -1
      if (a > b) return 1
    }
    return 0
  })
  return sha256(canonicalize(ordered))
}

export { TRANSFORM_TABLES }
