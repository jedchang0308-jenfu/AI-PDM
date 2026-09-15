import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertDataBundle,
  assertDataCutoverConfig,
  assertDataCutoverHandoff,
  assertDataCutoverImportReceipt,
  assertEquivalentCutoverReceipt,
  assertExistingRowsAreExpectedSubset,
  assertExistingRowsHaveExpectedPrimaryKeys,
  buildInsertSql,
  canonicalize,
  catalogStructureSha256,
  createDataBundle,
  createDataCutoverHandoff,
  dataCutoverObjectPaths,
  deriveDataMigrationPlan,
  parseRuntimeArgs,
  sha256,
  topologicalTableOrder,
  transformSourceRow,
} from './lib/dev012-production-data-cutover.mjs'
import { readDataCutoverEvidence } from './lib/dev012-owner-stage-executor.mjs'
import { serviceSnapshot } from './lib/dev012-production-data-cutover-provider.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev012-ai-pdm-production-data-cutover.json'), 'utf8'))
const sourceRevision = '532ae1ae409b667bb1d8adab5580d2dc6464c49c'
const identityUid = 'KHjDCJsvX1QxIhtTx14h7dJ0vXU2'
const identityReceiptSha256 = 'b'.repeat(64)

function firstPrincipalReceipt() {
  const core = {
    schemaVersion: 'jenfu.dev012.orgmaster-first-principal-bootstrap.v1',
    ownerApplicationId: 'orgmaster',
    releaseId: 'DEV012-REL-20260914-R60',
    sourceRevision: 'c'.repeat(40),
    accountType: 'human_privileged',
    assuranceLevel: 'aal1',
    authorizedAt: '2026-09-14T10:21:57.298Z',
    authorizedBy: 'OWNER_EXPLICIT_DECISION',
    emailSha256: sha256(config.identityRemap.email.toLowerCase()),
    employeeId: 'employee-shijie',
    evidenceScope: 'PRODUCTION_BOUND',
    identity: {
      issuer: 'https://securetoken.google.com/jenfu-platform-prod',
      principalId: `principal-firebase-${'d'.repeat(32)}`,
      subject: identityUid,
    },
    identityEvidenceRef: {
      uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/identity/example.json',
      sha256: 'e'.repeat(64),
    },
    oneTimeCas: true,
    releaseAuthority: true,
    status: 'READY',
  }
  return { ...core, bootstrapSha256: sha256(canonicalize(core)) }
}

function column(name, type = 'text') {
  return { name, type, notNull: name === 'id', hasDefault: false, generated: '', identity: '' }
}

function table(name, columns = [column('id')], rowCount = 0) {
  return { name, rowCount, columns, primaryKey: ['id'] }
}

function catalogWithHash(database, schema, tables, foreignKeys) {
  const core = { schemaVersion: 'jenfu.dev012.ai-pdm-database-catalog.v1', database, schema, tables: [...tables].sort((a, b) => a.name.localeCompare(b.name)), foreignKeys }
  return { ...core, catalogSha256: sha256(canonicalize(core)) }
}

function fixtures() {
  const transformsByTable = new Map()
  for (const rule of config.catalog.typeTransforms) {
    if (!transformsByTable.has(rule.table)) transformsByTable.set(rule.table, [])
    transformsByTable.get(rule.table).push(rule)
  }
  const named = new Set([
    ...transformsByTable.keys(),
    'users',
    'platform_principal_mappings',
    'numbering_rule_versions',
    'pdm_workbench_state_authority_control',
    'root_record',
    'child_record',
  ])
  for (let index = 1; named.size < config.catalog.expectedCopyTableCount; index += 1) named.add(`fixture_table_${String(index).padStart(3, '0')}`)

  const sourceRows = new Map()
  const sourceCommon = []
  const targetCommon = []
  for (const name of [...named].sort()) {
    let sourceColumns = [column('id')]
    let targetColumns = [column('id')]
    const rules = transformsByTable.get(name) ?? []
    for (const rule of rules) {
      sourceColumns.push(column(rule.column, rule.sourceType))
      targetColumns.push(column(rule.column, rule.targetType))
    }
    let rows = []
    if (rules.length > 0) {
      const row = { id: `${name}-1` }
      for (const rule of rules) row[rule.column] = rule.mode === 'JSONB_TO_CANONICAL_TEXT' ? { z: 2, a: 1 } : '2026-09-14T01:02:03.000Z'
      rows = [row]
    }
    if (name === 'users') {
      sourceColumns = targetColumns = ['id', 'email', 'company_id', 'role', 'account_status', 'account_lifecycle_version', 'system_role_enabled'].map((item) => column(item, item === 'account_lifecycle_version' || item === 'system_role_enabled' ? 'integer' : 'text'))
      rows = [{ id: config.identityRemap.pdmUserId, email: config.identityRemap.email, company_id: config.identityRemap.companyId, role: config.identityRemap.role, account_status: config.identityRemap.accountStatus, account_lifecycle_version: 1, system_role_enabled: 1 }]
    }
    if (name === 'platform_principal_mappings') {
      sourceColumns = targetColumns = ['id', 'pdm_user_id', 'external_subject', 'mapping_source', 'mapping_status'].map((item) => column(item))
      rows = [{ id: 'mapping-1', pdm_user_id: config.identityRemap.pdmUserId, external_subject: 'legacy-firebase-uid', mapping_source: 'shared_iam', mapping_status: 'active' }]
    }
    if (name === 'numbering_rule_versions') rows = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]
    if (name === 'pdm_workbench_state_authority_control') rows = [{ id: 'authority-1' }]
    if (name === 'root_record') rows = [{ id: 'root-1' }]
    if (name === 'child_record') rows = [{ id: 'child-1' }]
    sourceRows.set(name, rows)
    sourceCommon.push(table(name, sourceColumns, rows.length))
    const baseline = config.catalog.allowedTargetSeedRows[name] ?? 0
    targetCommon.push(table(name, targetColumns, baseline))
  }

  const sourceOnly = Object.entries(config.catalog.sourceExcludedTables).map(([name, disposition]) => table(name, [column('id')], disposition === 'RETAIN_LEGACY_LEDGER' ? 7 : 0))
  const targetOnly = Object.entries(config.catalog.targetOnlyTables).map(([name, rowCount]) => table(name, [column('id')], rowCount))
  const foreignKeys = [{ childTable: 'child_record', parentTable: 'root_record', constraintName: 'child_root_fk', deferrable: false, childColumns: ['id'], parentColumns: ['id'] }]
  return {
    sourceRows,
    sourceCatalog: catalogWithHash(config.source.database, config.source.schema, [...sourceCommon, ...sourceOnly], foreignKeys),
    targetCatalog: catalogWithHash(config.target.database, config.target.schema, [...targetCommon, ...targetOnly], foreignKeys),
  }
}

function expectCode(code, action) {
  assert.throws(action, (error) => error?.code === code)
}

function receipt(value) {
  const core = { ...value }
  delete core.receiptSha256
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

function exportReceiptFor(bundle, sourceCatalog) {
  const paths = dataCutoverObjectPaths(config, bundle.releaseId)
  return receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-export-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: bundle.releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256, executionName: `dev012-ai-data-export-${'a'.repeat(12)}-abcde`, transactionMode: 'REPEATABLE_READ_READ_ONLY', sourceSessionPreflight: { otherSessionCount: 0, hiddenSessionCount: 0, activeTransactionCount: 0, activeNonIdleCount: 0, activeMigrationSessionCount: 0 }, sourceCatalogSha256: sourceCatalog.catalogSha256, copyTableCount: bundle.tables.length, sourceRowCount: bundle.tables.reduce((sum, table) => sum + table.sourceSummary.rowCount, 0), identity: { pdmUserId: config.identityRemap.pdmUserId }, bundleRef: paths.bundle, bundleGeneration: '1', bundleBytesSha256: '8'.repeat(64), bundleBytes: 1234, bundleSha256: bundle.bundleSha256, rawRowsLogged: false, completedAt: '2026-09-14T01:30:00.000Z', status: 'PASS' })
}

function teardownReceiptFor(releaseId) {
  const suffix = sha256(canonicalize({ ownerApplicationId: config.ownerApplicationId, releaseId, sourceRevision })).slice(0, 12)
  return receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-teardown-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceJobName: `projects/${config.source.projectId}/locations/${config.source.region}/jobs/dev012-ai-data-export-${suffix}`, targetJobName: `projects/${config.target.projectId}/locations/${config.target.region}/jobs/dev012-ai-data-import-${suffix}`, sourceJobDeleted: true, targetJobDeleted: true, sourceBucketAccessRemoved: true, crossProjectArtifactAccessRemoved: true, resourceResidue: 0, observedAt: '2026-09-14T02:00:30.000Z', status: 'PASS' })
}

test('production config is exact and rejects transform policy drift', () => {
  assert.equal(assertDataCutoverConfig(structuredClone(config)).ownerApplicationId, 'ai-pdm')
  const drift = structuredClone(config)
  drift.catalog.typeTransforms[0].column = 'different_column'
  expectCode('DATA_CUTOVER_TRANSFORM_POLICY_INVALID', () => assertDataCutoverConfig(drift))
})

test('151-table plan binds structure and remains stable for exact replay data', () => {
  const { sourceCatalog, targetCatalog } = fixtures()
  const baseline = deriveDataMigrationPlan(config, sourceCatalog, targetCatalog)
  assert.equal(baseline.copyTables.length, 151)
  assert.ok(baseline.tableOrder.indexOf('root_record') < baseline.tableOrder.indexOf('child_record'))
  assert.equal(baseline.transforms.length, 13)
  const populated = structuredClone(targetCatalog)
  for (const target of populated.tables) {
    const source = sourceCatalog.tables.find((item) => item.name === target.name)
    if (source) target.rowCount = source.rowCount
  }
  const populatedCore = { ...populated }
  delete populatedCore.catalogSha256
  populated.catalogSha256 = sha256(canonicalize(populatedCore))
  expectCode('DATA_CUTOVER_TARGET_COPY_BASELINE_DRIFT', () => deriveDataMigrationPlan(config, sourceCatalog, populated))
  const replay = deriveDataMigrationPlan(config, sourceCatalog, populated, { allowPopulatedTarget: true })
  assert.equal(replay.planSha256, baseline.planSha256)
  assert.equal(replay.targetStructureSha256, catalogStructureSha256(targetCatalog))
})

test('bundle remaps only the existing admin mapping and detects tampering', () => {
  const { sourceCatalog, sourceRows } = fixtures()
  const bundle = createDataBundle({ config, sourceRevision, releaseId: '012-R66-AI-DATA', identityUid, identityReceiptSha256, sourceCatalog, rowsByTable: sourceRows })
  assert.equal(bundle.tables.length, 151)
  assertDataBundle(bundle, config, { releaseId: '012-R66-AI-DATA', sourceRevision })
  const mapping = bundle.tables.find((item) => item.name === 'platform_principal_mappings')
  const transformed = transformSourceRow(config, mapping.name, mapping.rows[0], identityUid)
  assert.equal(transformed.external_subject, identityUid)
  const json = bundle.tables.find((item) => item.name === 'drawing_recognition_adapter_results')
  assert.equal(transformSourceRow(config, json.name, json.rows[0], identityUid).diagnostics_json, '{"a":1,"z":2}')
  const tampered = structuredClone(bundle)
  tampered.tables.find((item) => item.name === 'users').rows[0].role = 'Viewer'
  expectCode('DATA_CUTOVER_BUNDLE_INVALID', () => assertDataBundle(tampered, config))
})

test('existing target content must be an exact subset of transformed source', () => {
  const expected = [{ id: 'one', value: 'A' }, { id: 'two', value: 'B' }]
  assert.equal(assertExistingRowsAreExpectedSubset([expected[0]], expected, 'fixture'), true)
  expectCode('DATA_CUTOVER_TARGET_SEED_CONTENT_DRIFT', () => assertExistingRowsAreExpectedSubset([{ id: 'rogue', value: 'X' }], expected, 'fixture'))
})

test('known target seeds bind exact primary keys while allowing migration-time field replacement', () => {
  const expected = [{ id: 'one', updated_at: 'source-time' }, { id: 'two', updated_at: 'source-time' }]
  const existing = [{ id: 'one', updated_at: 'target-time' }, { id: 'two', updated_at: 'target-time' }]
  assert.equal(assertExistingRowsHaveExpectedPrimaryKeys(existing, expected, ['id'], 'fixture'), true)
  expectCode('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_DRIFT', () => assertExistingRowsHaveExpectedPrimaryKeys([{ id: 'one' }, { id: 'rogue' }], expected, ['id'], 'fixture'))
  expectCode('DATA_CUTOVER_TARGET_SEED_PRIMARY_KEY_DRIFT', () => assertExistingRowsHaveExpectedPrimaryKeys([{ id: 'one' }], expected, ['id'], 'fixture'))
})

test('provider handoff joins exact import reconciliation and access fence', () => {
  const { sourceCatalog, sourceRows } = fixtures()
  const bundle = createDataBundle({ config, sourceRevision, releaseId: '012-R66-AI-DATA', identityUid, identityReceiptSha256, sourceCatalog, rowsByTable: sourceRows })
  const tableReceipts = bundle.tables.map((table) => ({ name: table.name, ...table.targetSummary }))
  const importReceipt = receipt({
    schemaVersion: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: bundle.releaseId, sourceRevision,
    sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema,
    identityReceiptSha256, executionName: `dev012-ai-data-import-${'b'.repeat(12)}-abcde`, sourceCatalogSha256: sourceCatalog.catalogSha256, targetPreImportCatalogSha256: '1'.repeat(64), migrationPlanSha256: '2'.repeat(64), bundleRef: dataCutoverObjectPaths(config, bundle.releaseId).bundle, bundleGeneration: '1', bundleBytesSha256: '8'.repeat(64), bundleSha256: bundle.bundleSha256,
    tableCount: tableReceipts.length, expectedRowCount: tableReceipts.reduce((sum, table) => sum + table.rowCount, 0), insertedRows: 12, tableReceipts,
    identity: { pdmUserId: config.identityRemap.pdmUserId, companyId: config.identityRemap.companyId, role: config.identityRemap.role, accountStatus: config.identityRemap.accountStatus, accountLifecycleVersion: 1, activeUidMappingCount: 1 },
    transaction: 'SERIALIZABLE_COMMITTED', sourceProductionWrites: false, siblingSchemaWrites: 0, rawRowsLogged: false, completedAt: '2026-09-14T02:00:00.000Z', status: 'PASS',
  })
  assertDataCutoverImportReceipt(importReceipt, config, { releaseId: bundle.releaseId, sourceRevision })
  const exportReceipt = exportReceiptFor(bundle, sourceCatalog)
  const fenceReceipt = receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-fence-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: bundle.releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceService: config.source.service, baselineEtag: 'baseline-etag', fencedEtag: 'fenced-etag', updateMask: 'invokerIamDisabled', beforeInvokerIamDisabled: true, afterInvokerIamDisabled: false, directInvokerBindingCount: 0, templateSha256: '4'.repeat(64), trafficSha256: '5'.repeat(64), templateDrift: 0, trafficDrift: 0, activeMigrationExecutions: 0, activeDatabaseSessions: 0, accessFenced: true, completedAt: '2026-09-14T01:00:00.000Z', status: 'PASS' })
  const teardownReceipt = teardownReceiptFor(bundle.releaseId)
  const paths = dataCutoverObjectPaths(config, bundle.releaseId)
  const handoff = createDataCutoverHandoff({ config, releaseId: bundle.releaseId, sourceRevision, identityReceiptSha256, exportReceiptRef: { uri: paths.exportReceipt, sha256: '9'.repeat(64) }, exportReceipt, importReceiptRef: { uri: paths.importReceipt, sha256: '6'.repeat(64) }, importReceipt, fenceReceiptRef: { uri: paths.fence, sha256: '7'.repeat(64) }, fenceReceipt, teardownReceiptRef: { uri: paths.teardown, sha256: '3'.repeat(64) }, teardownReceipt, observedAt: '2026-09-14T02:01:00.000Z' })
  assert.equal(assertDataCutoverHandoff(handoff, config, { releaseId: bundle.releaseId, sourceRevision }), handoff)
  const drift = { ...handoff, legacyAccessFenced: false }
  delete drift.handoffSha256
  drift.handoffSha256 = sha256(canonicalize(drift))
  expectCode('DATA_CUTOVER_HANDOFF_INVALID', () => assertDataCutoverHandoff(drift, config))
})

test('owner prepare and verify re-read immutable cutover evidence before candidate smoke', async () => {
  const { sourceCatalog, sourceRows } = fixtures()
  const releaseId = '012-R66-AI-DATA'
  const bundle = createDataBundle({ config, sourceRevision, releaseId, identityUid, identityReceiptSha256, sourceCatalog, rowsByTable: sourceRows })
  const tableReceipts = bundle.tables.map((table) => ({ name: table.name, ...table.targetSummary }))
  const paths = dataCutoverObjectPaths(config, releaseId)
  const importReceipt = receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceDatabase: config.source.database, targetProjectId: config.target.projectId, targetDatabase: config.target.database, targetSchema: config.target.schema, identityReceiptSha256, executionName: `dev012-ai-data-import-${'b'.repeat(12)}-abcde`, sourceCatalogSha256: sourceCatalog.catalogSha256, targetPreImportCatalogSha256: '1'.repeat(64), migrationPlanSha256: '2'.repeat(64), bundleRef: paths.bundle, bundleGeneration: '1', bundleBytesSha256: '8'.repeat(64), bundleSha256: bundle.bundleSha256, tableCount: tableReceipts.length, expectedRowCount: tableReceipts.reduce((sum, table) => sum + table.rowCount, 0), insertedRows: 12, tableReceipts, identity: { pdmUserId: config.identityRemap.pdmUserId, companyId: config.identityRemap.companyId, role: config.identityRemap.role, accountStatus: config.identityRemap.accountStatus, accountLifecycleVersion: 1, activeUidMappingCount: 1 }, transaction: 'SERIALIZABLE_COMMITTED', sourceProductionWrites: false, siblingSchemaWrites: 0, rawRowsLogged: false, completedAt: '2026-09-14T02:00:00.000Z', status: 'PASS' })
  const exportReceipt = exportReceiptFor(bundle, sourceCatalog)
  const fenceReceipt = receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-fence-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, sourceProjectId: config.source.projectId, sourceService: config.source.service, baselineEtag: 'baseline-etag', fencedEtag: 'fenced-etag', updateMask: 'invokerIamDisabled', beforeInvokerIamDisabled: true, afterInvokerIamDisabled: false, directInvokerBindingCount: 0, templateSha256: '4'.repeat(64), trafficSha256: '5'.repeat(64), templateDrift: 0, trafficDrift: 0, activeMigrationExecutions: 0, activeDatabaseSessions: 0, accessFenced: true, completedAt: '2026-09-14T01:00:00.000Z', status: 'PASS' })
  const objects = new Map()
  const put = (uri, value) => {
    const bytes = Buffer.from(`${canonicalize(value)}\n`)
    objects.set(uri, bytes)
    return { uri, sha256: sha256(bytes) }
  }
  const teardownReceipt = teardownReceiptFor(releaseId)
  const exportRef = put(paths.exportReceipt, exportReceipt)
  const importRef = put(paths.importReceipt, importReceipt)
  const fenceRef = put(paths.fence, fenceReceipt)
  const teardownRef = put(paths.teardown, teardownReceipt)
  const handoff = createDataCutoverHandoff({ config, releaseId, sourceRevision, identityReceiptSha256, exportReceiptRef: exportRef, exportReceipt, importReceiptRef: importRef, importReceipt, fenceReceiptRef: fenceRef, fenceReceipt, teardownReceiptRef: teardownRef, teardownReceipt, observedAt: '2026-09-14T02:01:00.000Z' })
  const handoffRef = put(paths.handoff, handoff)
  const transport = { readBytes: async (uri, { expectedSha256 } = {}) => { const bytes = objects.get(uri); assert.ok(bytes); assert.equal(sha256(bytes), expectedSha256); return { bytes, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1', crc32c: 'fixture' } } } }
  const evidence = await readDataCutoverEvidence({ transport, profile: { artifact: { releaseBucket: config.releaseBucket }, dataCutover: { gateMode: 'CUTOVER_OR_LIVE_AUTHORITY' } }, intent: { releaseId, sourceRevision }, readiness: { dataCutoverHandoffRef: handoffRef }, dataCutoverConfig: config })
  assert.equal(evidence.status, 'DATA_READY_FOR_CANDIDATE')
  assert.equal(evidence.tableCount, 151)
  const intentSha256 = 'c'.repeat(64)
  const terminal = receipt({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, stage: 'terminal', previousReceiptRef: { uri: `gs://${config.releaseBucket}/receipts/releases/${releaseId}/${intentSha256}/finalize.json`, sha256: 'd'.repeat(64) }, facts: { result: 'RELEASED', databaseDisposition: 'FORWARD_APPLIED', remainingHumanAction: 0 }, observedAt: '2026-09-14T02:02:00.000Z', status: 'PASS' })
  const terminalRef = put(`gs://${config.releaseBucket}/receipts/releases/${releaseId}/${intentSha256}/terminal.json`, terminal)
  const cleanup = receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-post-live-cleanup-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, handoffReceiptRef: handoffRef, handoffReceiptSha256: handoff.handoffSha256, terminalReceiptRef: terminalRef, terminalReceiptSha256: terminal.receiptSha256, bundleRef: paths.bundle, bundleGeneration: exportReceipt.bundleGeneration, bundleBytesSha256: exportReceipt.bundleBytesSha256, rawBundleDeleted: true, retainedHashReceipts: true, resourceResidue: 0, releaseAuthority: true, observedAt: '2026-09-14T02:03:00.000Z', status: 'PASS' })
  const cleanupRef = put(paths.postLiveCleanup, cleanup)
  const ordinaryEvidence = await readDataCutoverEvidence({ transport, profile: { artifact: { releaseBucket: config.releaseBucket }, dataCutover: { gateMode: 'CUTOVER_OR_LIVE_AUTHORITY' } }, intent: { releaseId: '012-FUTURE-RELEASE', sourceRevision: 'f'.repeat(40) }, readiness: { dataCutoverCompletionRef: cleanupRef }, dataCutoverConfig: config })
  assert.equal(ordinaryEvidence.status, 'NEUTRAL_AUTHORITY_LIVE')
  assert.equal(ordinaryEvidence.rawBundleDeleted, true)
  objects.set(importRef.uri, Buffer.from('{}\n'))
  await assert.rejects(() => readDataCutoverEvidence({ transport, profile: { artifact: { releaseBucket: config.releaseBucket }, dataCutover: { gateMode: 'CUTOVER_OR_LIVE_AUTHORITY' } }, intent: { releaseId, sourceRevision }, readiness: { dataCutoverHandoffRef: handoffRef }, dataCutoverConfig: config }))
})

test('legacy service snapshot binds entry policy, template and traffic independently', () => {
  const service = { name: `projects/${config.source.projectId}/locations/${config.source.region}/services/${config.source.service}`, etag: 'legacy-etag-1', generation: '10', observedGeneration: '10', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, template: { containers: [{ image: 'legacy@sha256:' + 'a'.repeat(64) }] }, traffic: [{ revision: 'legacy-r1', percent: 100 }] }
  const after = { ...service, etag: 'legacy-etag-2', generation: '11', observedGeneration: '11', invokerIamDisabled: false }
  const beforeSnapshot = serviceSnapshot(config, service)
  const afterSnapshot = serviceSnapshot(config, after)
  assert.equal(beforeSnapshot.invokerIamDisabled, true)
  assert.equal(afterSnapshot.invokerIamDisabled, false)
  assert.equal(beforeSnapshot.templateSha256, afterSnapshot.templateSha256)
  assert.equal(beforeSnapshot.trafficSha256, afterSnapshot.trafficSha256)
  assert.notEqual(beforeSnapshot.etag, afterSnapshot.etag)
})

test('receipt retry accepts only volatile attempt differences', () => {
  const first = receipt({ schemaVersion: 'jenfu.dev012.ai-pdm-data-import-receipt.v1', releaseId: '012-R66-AI-DATA', bundleSha256: 'c'.repeat(64), targetPreImportCatalogSha256: 'd'.repeat(64), insertedRows: 3604, tableReceipts: [{ name: 'users', rowCount: 1 }], completedAt: '2026-09-14T01:00:00.000Z', status: 'PASS' })
  const retry = receipt({ ...first, targetPreImportCatalogSha256: 'e'.repeat(64), insertedRows: 0, completedAt: '2026-09-14T01:05:00.000Z', receiptSha256: undefined })
  assert.equal(assertEquivalentCutoverReceipt(first, retry), first)
  const conflict = receipt({ ...retry, bundleSha256: 'f'.repeat(64), receiptSha256: undefined })
  expectCode('DATA_CUTOVER_RECEIPT_IMMUTABILITY_CONFLICT', () => assertEquivalentCutoverReceipt(first, conflict))
})

test('argument, SQL identifier, and cycle gates fail closed', () => {
  const paths = dataCutoverObjectPaths(config, '012-R66-AI-DATA')
  const args = parseRuntimeArgs(['--mode', 'export', '--release-id', '012-R66-AI-DATA', '--source-revision', sourceRevision, '--bundle-ref', paths.bundle, '--receipt-ref', paths.exportReceipt, '--identity-uid', identityUid, '--identity-receipt-sha256', identityReceiptSha256, '--acknowledgement', config.acknowledgements.export], config)
  assert.equal(args.mode, 'export')
  assert.equal(buildInsertSql('ai_pdm_core', 'users', ['id', 'email']), 'INSERT INTO "ai_pdm_core"."users" ("id","email") SELECT "id","email" FROM jsonb_populate_record(NULL::"ai_pdm_core"."users", $1::jsonb) ON CONFLICT DO NOTHING')
  expectCode('DATA_CUTOVER_SQL_IDENTIFIER_INVALID', () => buildInsertSql('public;drop', 'users', ['id']))
  expectCode('DATA_CUTOVER_FOREIGN_KEY_CYCLE', () => topologicalTableOrder(['a', 'b'], [{ childTable: 'a', parentTable: 'b' }, { childTable: 'b', parentTable: 'a' }]))
})
