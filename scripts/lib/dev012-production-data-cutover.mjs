import { createHash } from 'node:crypto'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/u
const REQUIRED_TRANSFORMS = [
  { table: 'drawing_recognition_adapter_results', column: 'diagnostics_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_decisions', column: 'before_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_decisions', column: 'after_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_formalization_events', column: 'target_fingerprints_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_formalization_events', column: 'applied_changes_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_formalization_events', column: 'exclusions_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_formalization_events', column: 'result_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_observations', column: 'geometry_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_recognition_sessions', column: 'not_before', sourceType: 'timestamp with time zone', targetType: 'text', mode: 'TIMESTAMPTZ_TO_TEXT' },
  { table: 'drawing_recognition_sources', column: 'adapter_plan_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'drawing_revisions', column: 'policy_snapshot_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'numbering_candidate_revision_drafts', column: 'policy_snapshot_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
  { table: 'pdm_attribute_definitions', column: 'aliases_json', sourceType: 'jsonb', targetType: 'text', mode: 'JSONB_TO_CANONICAL_TEXT' },
]

export class DataCutoverError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') { throw new DataCutoverError(code, detail) }

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex') }
export function quoteIdentifier(value) {
  if (!SAFE_NAME.test(value ?? '')) fail('DATA_CUTOVER_SQL_IDENTIFIER_INVALID', String(value))
  return `"${value}"`
}

function exactKeys(value, keys, code) {
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) fail(code)
}

export function dataCutoverObjectPaths(configInput, releaseId) {
  const config = assertDataCutoverConfig(configInput)
  if (!RELEASE_ID.test(releaseId ?? '')) fail('DATA_CUTOVER_RELEASE_ID_INVALID')
  const source = `gs://${config.releaseBucket}/source/migration-bundles/data-cutover/${releaseId}`
  const receipts = `gs://${config.releaseBucket}/receipts/data-cutover/${releaseId}`
  return {
    sourceInspection: `${source}/source-inspect-receipt.json`,
    targetInspection: `${receipts}/target-inspect-receipt.json`,
    bundle: `${source}/data-bundle.json.gz`,
    exportReceipt: `${source}/export-receipt.json`,
    importReceipt: `${receipts}/import-receipt.json`,
    providerPrepare: `${receipts}/provider-prepare-receipt.json`,
    fencePatch: `${receipts}/fence-patch-receipt.json`,
    fence: `${receipts}/fence-receipt.json`,
    teardown: `${receipts}/teardown-receipt.json`,
    restore: `${receipts}/restore-receipt.json`,
    abortCleanup: `${receipts}/abort-cleanup-receipt.json`,
    postLiveCleanup: `${receipts}/post-live-cleanup-receipt.json`,
    handoff: `gs://${config.releaseBucket}/receipts/data-cutover-handoffs/${releaseId}.json`,
  }
}

export function assertDataCutoverConfig(value) {
  exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'releaseBucket', 'billingAccountName', 'source', 'target', 'catalog', 'identityRemap', 'acknowledgements'], 'DATA_CUTOVER_CONFIG_KEYS_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-production-data-cutover.v1' || value.ownerApplicationId !== 'ai-pdm' || value.releaseBucket !== 'jenfu-platform-prod-aipdm-release' || value.billingAccountName !== 'billingAccounts/018678-C2F032-7680E4') fail('DATA_CUTOVER_CONFIG_IDENTITY_INVALID')
  const expectedSource = {
    projectId: 'jenfu-ai-pdm-prod', projectNumber: '451715062958', region: 'asia-east1', instanceConnectionName: 'jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres', database: 'ai_pdm', schema: 'public', service: 'ai-pdm-prod', migrationJob: 'ai-pdm-prod-migration-runner', serviceAccount: 'ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam.gserviceaccount.com', databaseLogin: 'ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam', network: 'ai-pdm-prod-vpc', subnet: 'ai-pdm-prod-runtime'
  }
  const expectedTarget = {
    projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', instanceConnectionName: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', database: 'jenfu_prod', schema: 'ai_pdm_core', migrationJob: 'ai-pdm-prod-migration-runner', serviceAccount: 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com', databaseLogin: 'aipdm-prod-migrator@jenfu-platform-prod.iam', network: 'jenfu-platform-prod-vpc', subnet: 'jenfu-platform-prod-runtime'
  }
  if (canonicalize(value.source) !== canonicalize(expectedSource) || canonicalize(value.target) !== canonicalize(expectedTarget)) fail('DATA_CUTOVER_TARGET_INVALID')
  const catalog = value.catalog
  exactKeys(catalog, ['expectedSourceTableCount', 'expectedTargetTableCount', 'expectedCopyTableCount', 'sourceExcludedTables', 'targetOnlyTables', 'allowedTargetSeedRows', 'typeTransforms'], 'DATA_CUTOVER_CATALOG_CONFIG_INVALID')
  if (catalog.expectedSourceTableCount !== 157 || catalog.expectedTargetTableCount !== 157 || catalog.expectedCopyTableCount !== 151) fail('DATA_CUTOVER_TABLE_DENOMINATOR_INVALID')
  const sourceExcluded = { import_batches: 'REQUIRE_EMPTY', import_staging_rows: 'REQUIRE_EMPTY', part_attachment_reuse_origins: 'REQUIRE_EMPTY', part_attachment_reuse_snapshots: 'REQUIRE_EMPTY', part_preview_settings: 'REQUIRE_EMPTY', pdm_schema_migrations: 'RETAIN_LEGACY_LEDGER' }
  const targetOnly = { active_role_catalog: 0, contract_manifest: 1, pdm_local_data_migrations: 0, role_catalog_entries: 0, role_catalog_publications: 0, schema_migrations: 14 }
  if (canonicalize(catalog.sourceExcludedTables) !== canonicalize(sourceExcluded) || canonicalize(catalog.targetOnlyTables) !== canonicalize(targetOnly) || canonicalize(catalog.allowedTargetSeedRows) !== canonicalize({ numbering_rule_versions: 3, pdm_workbench_state_authority_control: 1 })) fail('DATA_CUTOVER_TABLE_EXCEPTION_INVALID')
  if (!Array.isArray(catalog.typeTransforms) || catalog.typeTransforms.length !== 13) fail('DATA_CUTOVER_TRANSFORM_DENOMINATOR_INVALID')
  const transformKeys = new Set()
  for (const transform of catalog.typeTransforms) {
    exactKeys(transform, ['table', 'column', 'sourceType', 'targetType', 'mode'], 'DATA_CUTOVER_TRANSFORM_INVALID')
    if (!SAFE_NAME.test(transform.table) || !SAFE_NAME.test(transform.column) || transform.targetType !== 'text' || !['JSONB_TO_CANONICAL_TEXT', 'TIMESTAMPTZ_TO_TEXT'].includes(transform.mode)) fail('DATA_CUTOVER_TRANSFORM_INVALID')
    const key = `${transform.table}.${transform.column}`
    if (transformKeys.has(key)) fail('DATA_CUTOVER_TRANSFORM_DUPLICATE', key)
    transformKeys.add(key)
  }
  if (canonicalize(catalog.typeTransforms) !== canonicalize(REQUIRED_TRANSFORMS)) fail('DATA_CUTOVER_TRANSFORM_POLICY_INVALID')
  const identity = value.identityRemap
  if (canonicalize(identity) !== canonicalize({ email: 'jedchang0308@jenfu.com.tw', pdmUserId: 'prod-pdm-admin-001', companyId: 'company-jenfu', role: 'Admin', accountStatus: 'active', accountLifecycleVersion: 1, mappingSource: 'shared_iam', mappingStatus: 'active' })) fail('DATA_CUTOVER_IDENTITY_POLICY_INVALID')
  if (canonicalize(value.acknowledgements) !== canonicalize({ export: 'DEV-012-AI-PDM-PRODUCTION-DATA-EXPORT-APPROVED', import: 'DEV-012-AI-PDM-PRODUCTION-DATA-IMPORT-APPROVED', fence: 'DEV-012-AI-PDM-LEGACY-ACCESS-FENCE-APPROVED', restore: 'DEV-012-AI-PDM-LEGACY-ACCESS-RESTORE-APPROVED' })) fail('DATA_CUTOVER_ACKNOWLEDGEMENT_CONFIG_INVALID')
  return value
}

function tableMap(catalog, code) {
  if (!catalog || !Array.isArray(catalog.tables) || !Array.isArray(catalog.foreignKeys)) fail(code)
  const result = new Map()
  for (const table of catalog.tables) {
    exactKeys(table, ['name', 'rowCount', 'columns', 'primaryKey'], code)
    if (!SAFE_NAME.test(table.name) || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0 || !Array.isArray(table.columns) || !Array.isArray(table.primaryKey) || result.has(table.name)) fail(code, table.name)
    const names = new Set()
    for (const column of table.columns) {
      exactKeys(column, ['name', 'type', 'notNull', 'hasDefault', 'generated', 'identity'], code)
      if (!SAFE_NAME.test(column.name) || typeof column.type !== 'string' || names.has(column.name)) fail(code, `${table.name}.${column.name}`)
      names.add(column.name)
    }
    if (table.primaryKey.some((name) => !names.has(name)) || (table.rowCount > 0 && table.primaryKey.length === 0)) fail('DATA_CUTOVER_NONEMPTY_TABLE_WITHOUT_PRIMARY_KEY', table.name)
    result.set(table.name, table)
  }
  return result
}

function exactNameDifference(left, right) { return [...left].filter((name) => !right.has(name)).sort() }

export function catalogStructureSha256(catalog) {
  tableMap(catalog, 'DATA_CUTOVER_CATALOG_STRUCTURE_INVALID')
  const core = {
    schemaVersion: catalog.schemaVersion,
    database: catalog.database,
    schema: catalog.schema,
    tables: catalog.tables
      .map(({ rowCount: _rowCount, ...table }) => table)
      .sort((left, right) => left.name.localeCompare(right.name)),
    foreignKeys: [...catalog.foreignKeys]
      .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right))),
  }
  return sha256(canonicalize(core))
}

export function topologicalTableOrder(tableNames, foreignKeys) {
  const names = new Set(tableNames)
  const dependencies = new Map([...names].map((name) => [name, new Set()]))
  for (const foreignKey of foreignKeys) {
    if (!names.has(foreignKey.childTable) || !names.has(foreignKey.parentTable) || foreignKey.childTable === foreignKey.parentTable) continue
    dependencies.get(foreignKey.childTable).add(foreignKey.parentTable)
  }
  const remaining = new Set(names)
  const ordered = []
  while (remaining.size > 0) {
    const ready = [...remaining].filter((name) => [...dependencies.get(name)].every((dependency) => !remaining.has(dependency))).sort()
    if (ready.length === 0) fail('DATA_CUTOVER_FOREIGN_KEY_CYCLE', [...remaining].sort().join(','))
    for (const name of ready) { remaining.delete(name); ordered.push(name) }
  }
  return ordered
}

export function deriveDataMigrationPlan(configInput, sourceCatalog, targetCatalog, { allowPopulatedTarget = false } = {}) {
  const config = assertDataCutoverConfig(configInput)
  const source = tableMap(sourceCatalog, 'DATA_CUTOVER_SOURCE_CATALOG_INVALID')
  const target = tableMap(targetCatalog, 'DATA_CUTOVER_TARGET_CATALOG_INVALID')
  if (source.size !== config.catalog.expectedSourceTableCount || target.size !== config.catalog.expectedTargetTableCount) fail('DATA_CUTOVER_TABLE_COUNT_DRIFT')
  const sourceNames = new Set(source.keys())
  const targetNames = new Set(target.keys())
  const sourceOnly = exactNameDifference(sourceNames, targetNames)
  const targetOnly = exactNameDifference(targetNames, sourceNames)
  if (canonicalize(sourceOnly) !== canonicalize(Object.keys(config.catalog.sourceExcludedTables).sort()) || canonicalize(targetOnly) !== canonicalize(Object.keys(config.catalog.targetOnlyTables).sort())) fail('DATA_CUTOVER_TABLE_SET_DRIFT')
  for (const [name, disposition] of Object.entries(config.catalog.sourceExcludedTables)) if (disposition === 'REQUIRE_EMPTY' && source.get(name).rowCount !== 0) fail('DATA_CUTOVER_EXCLUDED_SOURCE_NOT_EMPTY', name)
  for (const [name, expected] of Object.entries(config.catalog.targetOnlyTables)) if (target.get(name).rowCount !== expected) fail('DATA_CUTOVER_TARGET_ONLY_BASELINE_DRIFT', name)
  const copyTables = [...sourceNames].filter((name) => targetNames.has(name)).sort()
  if (copyTables.length !== config.catalog.expectedCopyTableCount) fail('DATA_CUTOVER_COPY_TABLE_COUNT_DRIFT')
  const expectedTransforms = new Map(config.catalog.typeTransforms.map((item) => [`${item.table}.${item.column}`, item]))
  const observedTransforms = new Set()
  for (const tableName of copyTables) {
    const sourceTable = source.get(tableName)
    const targetTable = target.get(tableName)
    const sourceColumns = new Map(sourceTable.columns.map((column) => [column.name, column]))
    const targetColumns = new Map(targetTable.columns.map((column) => [column.name, column]))
    if (canonicalize([...sourceColumns.keys()].sort()) !== canonicalize([...targetColumns.keys()].sort())) fail('DATA_CUTOVER_COLUMN_SET_DRIFT', tableName)
    if (canonicalize(sourceTable.primaryKey) !== canonicalize(targetTable.primaryKey)) fail('DATA_CUTOVER_PRIMARY_KEY_DRIFT', tableName)
    for (const [columnName, sourceColumn] of sourceColumns) {
      const targetColumn = targetColumns.get(columnName)
      for (const field of ['notNull', 'hasDefault', 'generated', 'identity']) if (sourceColumn[field] !== targetColumn[field]) fail('DATA_CUTOVER_COLUMN_METADATA_DRIFT', `${tableName}.${columnName}.${field}`)
      if (sourceColumn.identity || targetColumn.identity) fail('DATA_CUTOVER_IDENTITY_COLUMN_UNSUPPORTED', `${tableName}.${columnName}`)
      if (sourceColumn.type === targetColumn.type) continue
      const key = `${tableName}.${columnName}`
      const allowed = expectedTransforms.get(key)
      if (!allowed || allowed.sourceType !== sourceColumn.type || allowed.targetType !== targetColumn.type) fail('DATA_CUTOVER_COLUMN_TYPE_DRIFT', key)
      observedTransforms.add(key)
    }
    const expectedSeedCount = config.catalog.allowedTargetSeedRows[tableName] ?? 0
    if (!allowPopulatedTarget && targetTable.rowCount !== expectedSeedCount) fail('DATA_CUTOVER_TARGET_COPY_BASELINE_DRIFT', tableName)
  }
  if (canonicalize([...observedTransforms].sort()) !== canonicalize([...expectedTransforms.keys()].sort())) fail('DATA_CUTOVER_TRANSFORM_SET_DRIFT')
  for (const foreignKey of targetCatalog.foreignKeys) {
    exactKeys(foreignKey, ['childTable', 'parentTable', 'constraintName', 'deferrable', 'childColumns', 'parentColumns'], 'DATA_CUTOVER_FOREIGN_KEY_INVALID')
    if (foreignKey.deferrable !== false || !SAFE_NAME.test(foreignKey.childTable) || !SAFE_NAME.test(foreignKey.parentTable)) fail('DATA_CUTOVER_FOREIGN_KEY_DRIFT', foreignKey.constraintName)
  }
  const copySet = new Set(copyTables)
  const normalizeForeignKeys = (catalog) => catalog.foreignKeys
    .filter((item) => copySet.has(item.childTable) && copySet.has(item.parentTable))
    .map((item) => ({ childTable: item.childTable, parentTable: item.parentTable, deferrable: item.deferrable, childColumns: item.childColumns, parentColumns: item.parentColumns }))
    .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)))
  if (canonicalize(normalizeForeignKeys(sourceCatalog)) !== canonicalize(normalizeForeignKeys(targetCatalog))) fail('DATA_CUTOVER_FOREIGN_KEY_SET_DRIFT')
  const tableOrder = topologicalTableOrder(copyTables, targetCatalog.foreignKeys)
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-data-migration-plan.v1', sourceCatalogSha256: sourceCatalog.catalogSha256, targetStructureSha256: catalogStructureSha256(targetCatalog), sourceOnly, targetOnly, copyTables, tableOrder, transforms: config.catalog.typeTransforms }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function transformSourceRow(configInput, tableName, row, identityUid) {
  const config = assertDataCutoverConfig(configInput)
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('DATA_CUTOVER_ROW_INVALID', tableName)
  const transformed = structuredClone(row)
  for (const rule of config.catalog.typeTransforms.filter((item) => item.table === tableName)) {
    const value = transformed[rule.column]
    if (value == null) continue
    if (rule.mode === 'JSONB_TO_CANONICAL_TEXT') transformed[rule.column] = typeof value === 'string' ? canonicalize(JSON.parse(value)) : canonicalize(value)
    else if (rule.mode === 'TIMESTAMPTZ_TO_TEXT') transformed[rule.column] = String(value)
  }
  if (tableName === 'platform_principal_mappings' && transformed.pdm_user_id === config.identityRemap.pdmUserId) {
    if (!identityUid || typeof identityUid !== 'string' || identityUid.length < 20 || identityUid.length > 128) fail('DATA_CUTOVER_IDENTITY_UID_INVALID')
    if (transformed.mapping_source !== config.identityRemap.mappingSource || transformed.mapping_status !== config.identityRemap.mappingStatus) fail('DATA_CUTOVER_IDENTITY_MAPPING_INVALID')
    transformed.external_subject = identityUid
  }
  return transformed
}

export function sortRowsByPrimaryKey(rows, primaryKey) {
  return [...rows].sort((left, right) => {
    for (const key of primaryKey) {
      const a = canonicalize(left[key]); const b = canonicalize(right[key])
      if (a < b) return -1
      if (a > b) return 1
    }
    return 0
  })
}

export function summarizeRows(rows, primaryKey) {
  const ordered = sortRowsByPrimaryKey(rows, primaryKey)
  const primaryKeys = ordered.map((row) => primaryKey.map((key) => row[key]))
  return { rowCount: ordered.length, primaryKeySha256: sha256(canonicalize(primaryKeys)), contentSha256: sha256(canonicalize(ordered)) }
}

export function assertExistingRowsAreExpectedSubset(existingRows, expectedRows, tableName) {
  if (!Array.isArray(existingRows) || !Array.isArray(expectedRows)) fail('DATA_CUTOVER_TARGET_SEED_CONTENT_INVALID', tableName)
  const expected = new Set(expectedRows.map(canonicalize))
  if (existingRows.some((row) => !expected.has(canonicalize(row)))) fail('DATA_CUTOVER_TARGET_SEED_CONTENT_DRIFT', tableName)
  return true
}

export function assertExistingRowsHaveExpectedPrimaryKeys(existingRows, expectedRows, primaryKey, tableName) {
  if (!Array.isArray(existingRows) || !Array.isArray(expectedRows) || !Array.isArray(primaryKey) || primaryKey.length === 0 || primaryKey.some((column) => !SAFE_NAME.test(column))) fail('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_INVALID', tableName)
  const rowKey = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || primaryKey.some((column) => row[column] === undefined)) fail('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_INVALID', tableName)
    return canonicalize(primaryKey.map((column) => row[column]))
  }
  const expectedKeys = expectedRows.map(rowKey)
  const existingKeys = existingRows.map(rowKey)
  if (new Set(expectedKeys).size !== expectedKeys.length || new Set(existingKeys).size !== existingKeys.length) fail('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_INVALID', tableName)
  if (canonicalize([...existingKeys].sort()) !== canonicalize([...expectedKeys].sort())) fail('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_DRIFT', tableName)
  return true
}

export function createDataBundle({ config: configInput, sourceRevision, releaseId, identityUid, identityReceiptSha256, sourceCatalog, rowsByTable }) {
  const config = assertDataCutoverConfig(configInput)
  if (!H40.test(sourceRevision ?? '') || !RELEASE_ID.test(releaseId ?? '') || !H64.test(identityReceiptSha256 ?? '')) fail('DATA_CUTOVER_BUNDLE_INPUT_INVALID')
  const source = tableMap(sourceCatalog, 'DATA_CUTOVER_SOURCE_CATALOG_INVALID')
  if (source.size !== config.catalog.expectedSourceTableCount) fail('DATA_CUTOVER_TABLE_COUNT_DRIFT')
  for (const [name, disposition] of Object.entries(config.catalog.sourceExcludedTables)) {
    if (!source.has(name) || (disposition === 'REQUIRE_EMPTY' && source.get(name).rowCount !== 0)) fail('DATA_CUTOVER_EXCLUDED_SOURCE_NOT_EMPTY', name)
  }
  const copyTables = [...source.keys()].filter((name) => !(name in config.catalog.sourceExcludedTables)).sort()
  if (copyTables.length !== config.catalog.expectedCopyTableCount) fail('DATA_CUTOVER_COPY_TABLE_COUNT_DRIFT')
  const tableOrder = topologicalTableOrder(copyTables, sourceCatalog.foreignKeys)
  const planCore = { schemaVersion: 'jenfu.dev012.ai-pdm-source-export-plan.v1', sourceCatalogSha256: sourceCatalog.catalogSha256, copyTables, tableOrder, transforms: config.catalog.typeTransforms }
  const plan = { ...planCore, planSha256: sha256(canonicalize(planCore)) }
  const tables = []
  for (const tableName of plan.tableOrder) {
    const catalogTable = sourceCatalog.tables.find((item) => item.name === tableName)
    const rows = rowsByTable.get(tableName)
    if (!Array.isArray(rows) || rows.length !== catalogTable.rowCount) fail('DATA_CUTOVER_BUNDLE_ROW_COUNT_MISMATCH', tableName)
    const sourceRows = sortRowsByPrimaryKey(rows, catalogTable.primaryKey)
    const targetRows = sourceRows.map((row) => transformSourceRow(config, tableName, row, identityUid))
    tables.push({ name: tableName, columns: catalogTable.columns.map((item) => item.name), primaryKey: catalogTable.primaryKey, sourceSummary: summarizeRows(sourceRows, catalogTable.primaryKey), targetSummary: summarizeRows(targetRows, catalogTable.primaryKey), rows: sourceRows })
  }
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-production-data-bundle.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityUid, identityReceiptSha256, plan, sourceCatalog, tables }
  return { ...core, bundleSha256: sha256(canonicalize(core)) }
}

export function assertDataBundle(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  const core = { ...value }; delete core.bundleSha256
  if (!value || value.schemaVersion !== 'jenfu.dev012.ai-pdm-production-data-bundle.v1' || value.ownerApplicationId !== 'ai-pdm' || !RELEASE_ID.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '') || !H64.test(value.identityReceiptSha256 ?? '') || !H64.test(value.bundleSha256 ?? '') || sha256(canonicalize(core)) !== value.bundleSha256) fail('DATA_CUTOVER_BUNDLE_INVALID')
  if (value.sourceProjectId !== config.source.projectId || value.sourceDatabase !== config.source.database || value.targetProjectId !== config.target.projectId || value.targetDatabase !== config.target.database || value.targetSchema !== config.target.schema || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_BUNDLE_TARGET_MISMATCH')
  if (!value.plan || value.plan.schemaVersion !== 'jenfu.dev012.ai-pdm-source-export-plan.v1' || !H64.test(value.plan.planSha256 ?? '')) fail('DATA_CUTOVER_BUNDLE_PLAN_INVALID')
  const planCore = { ...value.plan }; delete planCore.planSha256
  if (sha256(canonicalize(planCore)) !== value.plan.planSha256 || !Array.isArray(value.tables) || canonicalize(value.tables.map((item) => item.name)) !== canonicalize(value.plan.tableOrder)) fail('DATA_CUTOVER_BUNDLE_TABLE_ORDER_INVALID')
  for (const table of value.tables) {
    if (!Array.isArray(table.rows) || !Array.isArray(table.primaryKey) || table.rows.length !== table.sourceSummary.rowCount) fail('DATA_CUTOVER_BUNDLE_TABLE_INVALID', table.name)
    if (canonicalize(summarizeRows(table.rows, table.primaryKey)) !== canonicalize(table.sourceSummary)) fail('DATA_CUTOVER_BUNDLE_SOURCE_HASH_MISMATCH', table.name)
    const targetRows = table.rows.map((row) => transformSourceRow(config, table.name, row, value.identityUid))
    if (canonicalize(summarizeRows(targetRows, table.primaryKey)) !== canonicalize(table.targetSummary)) fail('DATA_CUTOVER_BUNDLE_TARGET_HASH_MISMATCH', table.name)
  }
  return value
}

export function parseRuntimeArgs(argv, configInput) {
  const config = assertDataCutoverConfig(configInput)
  const allowed = new Set(['--mode', '--release-id', '--source-revision', '--bundle-ref', '--bundle-sha256', '--bundle-generation', '--receipt-ref', '--identity-uid', '--identity-receipt-sha256', '--acknowledgement'])
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1]
    if (!allowed.has(key) || !value || result[key]) fail('DATA_CUTOVER_ARGUMENT_INVALID', key)
    result[key] = value
  }
  if (!['inspect-source', 'inspect-target', 'export', 'import'].includes(result['--mode']) || !RELEASE_ID.test(result['--release-id'] ?? '') || !H40.test(result['--source-revision'] ?? '')) fail('DATA_CUTOVER_ARGUMENT_INVALID')
  const paths = dataCutoverObjectPaths(config, result['--release-id'])
  const expectedReceipt = { 'inspect-source': paths.sourceInspection, 'inspect-target': paths.targetInspection, export: paths.exportReceipt, import: paths.importReceipt }[result['--mode']]
  if (result['--receipt-ref'] !== expectedReceipt) fail('DATA_CUTOVER_ARGUMENT_INVALID')
  const identityArgsValid = Boolean(result['--identity-uid']) && H64.test(result['--identity-receipt-sha256'] ?? '')
  if (['inspect-source', 'inspect-target'].includes(result['--mode']) && (!identityArgsValid || result['--bundle-ref'] || result['--bundle-sha256'] || result['--bundle-generation'] || result['--acknowledgement'])) fail('DATA_CUTOVER_ARGUMENT_INVALID')
  if (result['--mode'] === 'export' && (!identityArgsValid || result['--bundle-ref'] !== paths.bundle || result['--bundle-sha256'] || result['--bundle-generation'] || result['--acknowledgement'] !== config.acknowledgements.export)) fail('DATA_CUTOVER_ARGUMENT_INVALID')
  if (result['--mode'] === 'import' && (result['--bundle-ref'] !== paths.bundle || !H64.test(result['--bundle-sha256'] ?? '') || !/^[1-9][0-9]*$/u.test(result['--bundle-generation'] ?? '') || result['--identity-uid'] || result['--identity-receipt-sha256'] || result['--acknowledgement'] !== config.acknowledgements.import)) fail('DATA_CUTOVER_ARGUMENT_INVALID')
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase()), value]))
}

export function buildInsertSql(schema, table, columns) {
  const target = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
  const names = columns.map(quoteIdentifier).join(',')
  return `INSERT INTO ${target} (${names}) SELECT ${names} FROM jsonb_populate_record(NULL::${target}, $1::jsonb) ON CONFLICT DO NOTHING`
}

function assertCutoverRef(value, config, prefix) {
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(['sha256', 'uri']) || !H64.test(value.sha256 ?? '') || !value.uri?.startsWith(`gs://${config.releaseBucket}/${prefix}/`) || value.uri.includes('..')) fail('DATA_CUTOVER_RECEIPT_REF_INVALID')
  return value
}

function assertSelfHash(value, field, code) {
  if (!value || !H64.test(value[field] ?? '')) fail(code)
  const core = { ...value }
  delete core[field]
  if (sha256(canonicalize(core)) !== value[field]) fail(code)
  return value
}

export function assertDatabaseCatalog(value, expected, code = 'DATA_CUTOVER_DATABASE_CATALOG_INVALID') {
  if (!value || value.schemaVersion !== 'jenfu.dev012.ai-pdm-database-catalog.v1' || value.database !== expected.database || value.schema !== expected.schema || !H64.test(value.catalogSha256 ?? '')) fail(code)
  const core = { ...value }
  delete core.catalogSha256
  if (sha256(canonicalize(core)) !== value.catalogSha256) fail(code)
  tableMap(value, code)
  return value
}

function assertSeedSummaries(value, config, code) {
  const names = Object.keys(config.catalog.allowedTargetSeedRows).sort()
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize(names)) fail(code)
  for (const name of names) {
    const summary = value[name]
    if (!summary || canonicalize(Object.keys(summary).sort()) !== canonicalize(['contentSha256', 'primaryKeySha256', 'rowCount']) || summary.rowCount !== config.catalog.allowedTargetSeedRows[name] || !H64.test(summary.primaryKeySha256 ?? '') || !H64.test(summary.contentSha256 ?? '')) fail(code)
  }
  return value
}

export function assertSourceInspectionReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_SOURCE_INSPECTION_RECEIPT_INVALID')
  exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'projectId', 'database', 'schema', 'identityReceiptSha256', 'executionName', 'catalog', 'seedSummaries', 'identity', 'sessionSnapshot', 'totalRowCount', 'rawRowsLogged', 'completedAt', 'status', 'receiptSha256'], 'DATA_CUTOVER_SOURCE_INSPECTION_RECEIPT_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-source-inspection-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.projectId !== config.source.projectId || value.database !== config.source.database || value.schema !== config.source.schema || !H64.test(value.identityReceiptSha256 ?? '') || !/^dev012-ai-data-export-[a-f0-9]{12}-[a-z0-9]{5}$/u.test(value.executionName ?? '') || value.rawRowsLogged !== false || value.status !== 'PASS' || !Number.isFinite(Date.parse(value.completedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_SOURCE_INSPECTION_RECEIPT_INVALID')
  assertDatabaseCatalog(value.catalog, config.source, 'DATA_CUTOVER_SOURCE_INSPECTION_CATALOG_INVALID')
  if (value.catalog.tables.length !== config.catalog.expectedSourceTableCount || value.totalRowCount !== value.catalog.tables.reduce((sum, table) => sum + table.rowCount, 0)) fail('DATA_CUTOVER_SOURCE_INSPECTION_RECEIPT_INVALID')
  assertSeedSummaries(value.seedSummaries, config, 'DATA_CUTOVER_SOURCE_SEED_SUMMARY_INVALID')
  if (canonicalize(value.identity) !== canonicalize({ pdmUserId: config.identityRemap.pdmUserId, companyId: config.identityRemap.companyId, role: config.identityRemap.role, accountStatus: config.identityRemap.accountStatus, accountLifecycleVersion: config.identityRemap.accountLifecycleVersion, priorMappingCount: 1, currentUidCollisionCount: 0 })) fail('DATA_CUTOVER_SOURCE_INSPECTION_IDENTITY_INVALID')
  const session = value.sessionSnapshot
  const sessionKeys = ['otherSessionCount', 'hiddenSessionCount', 'activeTransactionCount', 'activeNonIdleCount', 'activeMigrationSessionCount']
  if (!session || canonicalize(Object.keys(session).sort()) !== canonicalize(sessionKeys.sort()) || Object.values(session).some((count) => !Number.isSafeInteger(count) || count < 0) || session.hiddenSessionCount !== 0 || session.activeMigrationSessionCount !== 0) fail('DATA_CUTOVER_SOURCE_INSPECTION_SESSION_INVALID')
  return value
}

export function assertTargetInspectionReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_TARGET_INSPECTION_RECEIPT_INVALID')
  exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'projectId', 'database', 'schema', 'identityReceiptSha256', 'executionName', 'catalog', 'seedSummaries', 'activeUidMappingCount', 'totalRowCount', 'rawRowsLogged', 'completedAt', 'status', 'receiptSha256'], 'DATA_CUTOVER_TARGET_INSPECTION_RECEIPT_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-target-inspection-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.projectId !== config.target.projectId || value.database !== config.target.database || value.schema !== config.target.schema || !H64.test(value.identityReceiptSha256 ?? '') || !/^dev012-ai-data-import-[a-f0-9]{12}-[a-z0-9]{5}$/u.test(value.executionName ?? '') || value.activeUidMappingCount !== 0 || value.rawRowsLogged !== false || value.status !== 'PASS' || !Number.isFinite(Date.parse(value.completedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_TARGET_INSPECTION_RECEIPT_INVALID')
  assertDatabaseCatalog(value.catalog, config.target, 'DATA_CUTOVER_TARGET_INSPECTION_CATALOG_INVALID')
  if (value.catalog.tables.length !== config.catalog.expectedTargetTableCount || value.totalRowCount !== value.catalog.tables.reduce((sum, table) => sum + table.rowCount, 0)) fail('DATA_CUTOVER_TARGET_INSPECTION_RECEIPT_INVALID')
  assertSeedSummaries(value.seedSummaries, config, 'DATA_CUTOVER_TARGET_SEED_SUMMARY_INVALID')
  return value
}

export function assertDataCutoverImportReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_IMPORT_RECEIPT_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-import-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceDatabase !== config.source.database || value.targetProjectId !== config.target.projectId || value.targetDatabase !== config.target.database || value.targetSchema !== config.target.schema || !/^dev012-ai-data-import-[a-f0-9]{12}-[a-z0-9]{5}$/u.test(value.executionName ?? '') || value.tableCount !== config.catalog.expectedCopyTableCount || value.transaction !== 'SERIALIZABLE_COMMITTED' || value.sourceProductionWrites !== false || value.siblingSchemaWrites !== 0 || value.rawRowsLogged !== false || value.status !== 'PASS' || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_IMPORT_RECEIPT_INVALID')
  const paths = dataCutoverObjectPaths(config, value.releaseId)
  if (value.bundleRef !== paths.bundle || !/^[1-9][0-9]*$/u.test(value.bundleGeneration ?? '') || !H64.test(value.identityReceiptSha256 ?? '') || !H64.test(value.sourceCatalogSha256 ?? '') || !H64.test(value.targetPreImportCatalogSha256 ?? '') || !H64.test(value.migrationPlanSha256 ?? '') || !H64.test(value.bundleSha256 ?? '') || !H64.test(value.bundleBytesSha256 ?? '') || !Array.isArray(value.tableReceipts) || value.tableReceipts.length !== config.catalog.expectedCopyTableCount || !Number.isSafeInteger(value.expectedRowCount) || value.expectedRowCount <= 0 || value.expectedRowCount !== value.tableReceipts.reduce((sum, table) => sum + table.rowCount, 0)) fail('DATA_CUTOVER_IMPORT_RECEIPT_INVALID')
  const names = new Set()
  for (const table of value.tableReceipts) {
    if (!SAFE_NAME.test(table?.name ?? '') || names.has(table.name) || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0 || !H64.test(table.primaryKeySha256 ?? '') || !H64.test(table.contentSha256 ?? '')) fail('DATA_CUTOVER_IMPORT_RECEIPT_INVALID')
    names.add(table.name)
  }
  if (value.identity?.pdmUserId !== config.identityRemap.pdmUserId || value.identity.companyId !== config.identityRemap.companyId || value.identity.role !== config.identityRemap.role || value.identity.accountStatus !== config.identityRemap.accountStatus || value.identity.accountLifecycleVersion !== config.identityRemap.accountLifecycleVersion || value.identity.activeUidMappingCount !== 1) fail('DATA_CUTOVER_IMPORT_RECEIPT_IDENTITY_INVALID')
  return value
}

export function assertDataCutoverExportReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_EXPORT_RECEIPT_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-export-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceDatabase !== config.source.database || value.targetProjectId !== config.target.projectId || value.targetDatabase !== config.target.database || value.targetSchema !== config.target.schema || !/^dev012-ai-data-export-[a-f0-9]{12}-[a-z0-9]{5}$/u.test(value.executionName ?? '') || value.copyTableCount !== config.catalog.expectedCopyTableCount || value.transactionMode !== 'REPEATABLE_READ_READ_ONLY' || value.rawRowsLogged !== false || value.status !== 'PASS' || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_EXPORT_RECEIPT_INVALID')
  const paths = dataCutoverObjectPaths(config, value.releaseId)
  if (value.bundleRef !== paths.bundle || !/^[1-9][0-9]*$/u.test(value.bundleGeneration ?? '') || !H64.test(value.identityReceiptSha256 ?? '') || !H64.test(value.sourceCatalogSha256 ?? '') || !H64.test(value.bundleSha256 ?? '') || !H64.test(value.bundleBytesSha256 ?? '') || !Number.isSafeInteger(value.bundleBytes) || value.bundleBytes <= 0 || !Number.isSafeInteger(value.sourceRowCount) || value.sourceRowCount <= 0 || value.sourceSessionPreflight?.hiddenSessionCount !== 0 || value.sourceSessionPreflight.activeTransactionCount !== 0 || value.sourceSessionPreflight.activeNonIdleCount !== 0 || value.sourceSessionPreflight.activeMigrationSessionCount !== 0) fail('DATA_CUTOVER_EXPORT_RECEIPT_INVALID')
  return value
}

export function assertDataCutoverFenceReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_FENCE_RECEIPT_INVALID')
  if (value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-fence-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceService !== config.source.service || value.accessFenced !== true || value.activeMigrationExecutions !== 0 || value.activeDatabaseSessions !== 0 || value.templateDrift !== 0 || value.trafficDrift !== 0 || value.status !== 'PASS' || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_FENCE_RECEIPT_INVALID')
  if (!H64.test(value.templateSha256 ?? '') || !H64.test(value.trafficSha256 ?? '') || typeof value.baselineEtag !== 'string' || value.baselineEtag.length < 8 || typeof value.fencedEtag !== 'string' || value.fencedEtag.length < 8 || value.updateMask !== 'invokerIamDisabled' || value.beforeInvokerIamDisabled !== true || value.afterInvokerIamDisabled !== false || value.directInvokerBindingCount !== 0) fail('DATA_CUTOVER_FENCE_RECEIPT_INVALID')
  return value
}

export function assertDataCutoverTeardownReceipt(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'receiptSha256', 'DATA_CUTOVER_TEARDOWN_RECEIPT_INVALID')
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceJobName', 'targetJobName', 'sourceJobDeleted', 'targetJobDeleted', 'sourceBucketAccessRemoved', 'crossProjectArtifactAccessRemoved', 'resourceResidue', 'observedAt', 'status', 'receiptSha256']
  if (canonicalize(Object.keys(value).sort()) !== canonicalize(exact.sort()) || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-teardown-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceJobDeleted !== true || value.targetJobDeleted !== true || value.sourceBucketAccessRemoved !== true || value.crossProjectArtifactAccessRemoved !== true || value.resourceResidue !== 0 || value.status !== 'PASS' || !Number.isFinite(Date.parse(value.observedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_TEARDOWN_RECEIPT_INVALID')
  const suffix = sha256(canonicalize({ ownerApplicationId: config.ownerApplicationId, releaseId: value.releaseId, sourceRevision: value.sourceRevision })).slice(0, 12)
  if (value.sourceJobName !== `projects/${config.source.projectId}/locations/${config.source.region}/jobs/dev012-ai-data-export-${suffix}` || value.targetJobName !== `projects/${config.target.projectId}/locations/${config.target.region}/jobs/dev012-ai-data-import-${suffix}`) fail('DATA_CUTOVER_TEARDOWN_RECEIPT_INVALID')
  return value
}

export function createDataCutoverHandoff({ config: configInput, releaseId, sourceRevision, identityReceiptSha256, exportReceiptRef, exportReceipt, importReceiptRef, importReceipt, fenceReceiptRef, fenceReceipt, teardownReceiptRef, teardownReceipt, observedAt }) {
  const config = assertDataCutoverConfig(configInput)
  if (!RELEASE_ID.test(releaseId ?? '') || !H40.test(sourceRevision ?? '') || !H64.test(identityReceiptSha256 ?? '') || !Number.isFinite(Date.parse(observedAt))) fail('DATA_CUTOVER_HANDOFF_INPUT_INVALID')
  const paths = dataCutoverObjectPaths(config, releaseId)
  for (const [value, uri] of [[exportReceiptRef, paths.exportReceipt], [importReceiptRef, paths.importReceipt], [fenceReceiptRef, paths.fence], [teardownReceiptRef, paths.teardown]]) {
    assertCutoverRef(value, config, uri.includes('/source/migration-bundles/') ? 'source/migration-bundles' : 'receipts')
    if (value.uri !== uri) fail('DATA_CUTOVER_RECEIPT_REF_INVALID')
  }
  assertDataCutoverExportReceipt(exportReceipt, config, { releaseId, sourceRevision })
  assertDataCutoverImportReceipt(importReceipt, config, { releaseId, sourceRevision })
  assertDataCutoverFenceReceipt(fenceReceipt, config, { releaseId, sourceRevision })
  assertDataCutoverTeardownReceipt(teardownReceipt, config, { releaseId, sourceRevision })
  if (exportReceipt.identityReceiptSha256 !== identityReceiptSha256 || importReceipt.identityReceiptSha256 !== identityReceiptSha256 || exportReceipt.bundleSha256 !== importReceipt.bundleSha256 || exportReceipt.bundleBytesSha256 !== importReceipt.bundleBytesSha256 || exportReceipt.sourceCatalogSha256 !== importReceipt.sourceCatalogSha256 || exportReceipt.sourceRowCount !== importReceipt.expectedRowCount) fail('DATA_CUTOVER_HANDOFF_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev012.ai-pdm-data-cutover-handoff.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision,
    sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema,
    identityReceiptSha256, exportReceiptRef, importReceiptRef, fenceReceiptRef, teardownReceiptRef, teardownReceiptSha256: teardownReceipt.receiptSha256, sourceCatalogSha256: importReceipt.sourceCatalogSha256, migrationPlanSha256: importReceipt.migrationPlanSha256, bundleSha256: importReceipt.bundleSha256,
    targetReconciliationSha256: sha256(canonicalize(importReceipt.tableReceipts)), tableCount: importReceipt.tableCount, expectedRowCount: importReceipt.expectedRowCount,
    legacyAccessFenced: true, remainingHumanAction: 0, status: 'DATA_READY_FOR_CANDIDATE', releaseAuthority: true, evidenceScope: 'PROVIDER_VERIFIED', observedAt,
  }
  return { ...core, handoffSha256: sha256(canonicalize(core)) }
}

export function assertDataCutoverHandoff(value, configInput, expected = {}) {
  const config = assertDataCutoverConfig(configInput)
  assertSelfHash(value, 'handoffSha256', 'DATA_CUTOVER_HANDOFF_INVALID')
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceProjectId', 'sourceDatabase', 'targetProjectId', 'targetDatabase', 'targetSchema', 'identityReceiptSha256', 'exportReceiptRef', 'importReceiptRef', 'fenceReceiptRef', 'teardownReceiptRef', 'teardownReceiptSha256', 'sourceCatalogSha256', 'migrationPlanSha256', 'bundleSha256', 'targetReconciliationSha256', 'tableCount', 'expectedRowCount', 'legacyAccessFenced', 'remainingHumanAction', 'status', 'releaseAuthority', 'evidenceScope', 'observedAt', 'handoffSha256']
  if (canonicalize(Object.keys(value).sort()) !== canonicalize(exact.sort()) || value.schemaVersion !== 'jenfu.dev012.ai-pdm-data-cutover-handoff.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceProjectId !== config.source.projectId || value.sourceDatabase !== config.source.database || value.targetProjectId !== config.target.projectId || value.targetDatabase !== config.target.database || value.targetSchema !== config.target.schema || value.tableCount !== config.catalog.expectedCopyTableCount || !Number.isSafeInteger(value.expectedRowCount) || value.expectedRowCount <= 0 || value.legacyAccessFenced !== true || value.remainingHumanAction !== 0 || value.status !== 'DATA_READY_FOR_CANDIDATE' || value.releaseAuthority !== true || value.evidenceScope !== 'PROVIDER_VERIFIED' || !Number.isFinite(Date.parse(value.observedAt)) || (expected.releaseId && value.releaseId !== expected.releaseId) || (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision)) fail('DATA_CUTOVER_HANDOFF_INVALID')
  for (const name of ['identityReceiptSha256', 'teardownReceiptSha256', 'sourceCatalogSha256', 'migrationPlanSha256', 'bundleSha256', 'targetReconciliationSha256']) if (!H64.test(value[name] ?? '')) fail('DATA_CUTOVER_HANDOFF_INVALID')
  const paths = dataCutoverObjectPaths(config, value.releaseId)
  for (const [ref, uri] of [[value.exportReceiptRef, paths.exportReceipt], [value.importReceiptRef, paths.importReceipt], [value.fenceReceiptRef, paths.fence], [value.teardownReceiptRef, paths.teardown]]) {
    assertCutoverRef(ref, config, uri.includes('/source/migration-bundles/') ? 'source/migration-bundles' : 'receipts')
    if (ref.uri !== uri) fail('DATA_CUTOVER_HANDOFF_INVALID')
  }
  return value
}

export function assertEquivalentCutoverReceipt(existing, candidate) {
  const allowed = new Set([
    'jenfu.dev012.ai-pdm-data-export-receipt.v1',
    'jenfu.dev012.ai-pdm-data-import-receipt.v1',
  ])
  const normalize = (value) => {
    if (!value || !allowed.has(value.schemaVersion) || !H64.test(value.receiptSha256 ?? '')) fail('DATA_CUTOVER_RECEIPT_INVALID')
    const core = { ...value }
    delete core.receiptSha256
    if (sha256(canonicalize(core)) !== value.receiptSha256) fail('DATA_CUTOVER_RECEIPT_HASH_MISMATCH')
    delete core.completedAt
    if (value.schemaVersion.endsWith('data-import-receipt.v1')) {
      delete core.insertedRows
      delete core.targetPreImportCatalogSha256
    }
    return core
  }
  if (existing?.schemaVersion !== candidate?.schemaVersion || canonicalize(normalize(existing)) !== canonicalize(normalize(candidate))) fail('DATA_CUTOVER_RECEIPT_IMMUTABILITY_CONFLICT')
  return existing
}
