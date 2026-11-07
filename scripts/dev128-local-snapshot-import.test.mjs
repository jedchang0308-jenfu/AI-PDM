import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSnapshotTargetCompatible,
  buildImportOrder,
  losslessCanonicalJson,
  parseLosslessJson,
  selectSnapshotRowsForReadback,
  transformSnapshotRows
} from './lib/dev128-local-snapshot-import.mjs'

const column = (name, type) => ({ name, type, notNull: name === 'id', hasDefault: false, generated: '', identity: '' })

test('lossless JSON round trips arbitrary precision numbers without JavaScript float conversion', () => {
  const value = parseLosslessJson('{"amount":900719925474099312345.678901,"nested":[-0.0000000000000000003,1e+42]}')
  assert.equal(losslessCanonicalJson(value), '{"amount":900719925474099312345.678901,"nested":[-0.0000000000000000003,1e+42]}')
})

test('local target requires the exact current ai_pdm_core column types', () => {
  const tables = [{
    name: 'drawing_revisions',
    rowCount: 0,
    primaryKey: ['id'],
    columns: [column('id', 'text'), column('policy_snapshot_json', 'jsonb')]
  }]
  const payload = {
    source: { catalog: { tables, foreignKeys: [] } },
    tables: [{ name: 'drawing_revisions', rowCount: 0, primaryKey: ['id'], rows: [] }]
  }
  const targetCatalog = { schema: 'ai_pdm_core', database: 'local', tables: structuredClone(tables), foreignKeys: [] }
  assert.deepEqual(assertSnapshotTargetCompatible({ payload, targetCatalog }).outputNames, ['drawing_revisions'])
  const drifted = structuredClone(targetCatalog)
  drifted.tables[0].columns[1].type = 'text'
  assert.throws(() => assertSnapshotTargetCompatible({ payload, targetCatalog: drifted }), { code: 'DEV128_TARGET_COLUMN_TYPE_MISMATCH' })
})

test('current-schema import retains masked JSON as JSONB without legacy transforms', () => {
  const value = { weight: { __dev128_number_v1__: '9007199254740993.0001' } }
  const payload = { tables: [{ name: 'drawing_revisions', rowCount: 1, rows: [{ id: 'revision-local', policy_snapshot_json: value }] }] }
  const targetTable = { name: 'drawing_revisions', columns: [column('id', 'text'), column('policy_snapshot_json', 'jsonb')] }
  const rows = transformSnapshotRows({ payload, targetTable, cutoverConfig: {} })
  assert.deepEqual(rows[0].policy_snapshot_json, value)
})

test('import order places parent tables before children and detects cross-table cycles', () => {
  const foreignKeys = [{ childTable: 'children', parentTable: 'parents', deferrable: false, childColumns: ['parent_id'], parentColumns: ['id'] }]
  assert.deepEqual(buildImportOrder({ tableNames: ['children', 'parents'], foreignKeys }), ['parents', 'children'])
  assert.throws(() => buildImportOrder({ tableNames: ['alpha', 'beta'], foreignKeys: [
    { childTable: 'alpha', parentTable: 'beta' }, { childTable: 'beta', parentTable: 'alpha' }
  ] }), { code: 'DATA_CUTOVER_FOREIGN_KEY_CYCLE' })
})

test('readback separates fixed local principals from imported snapshot rows', () => {
  const expectedRows = [{ id: 'prod-user-1', role: 'Engineer' }, { id: 'prod-user-2', role: 'Manager' }]
  const observedRows = [...expectedRows, { id: 'pdm-local-test-admin-user', role: 'Admin' }]
  assert.deepEqual(selectSnapshotRowsForReadback({
    expectedRows,
    observedRows,
    primaryKey: ['id'],
    preservedPrimaryKeys: [['pdm-local-test-admin-user']]
  }), expectedRows)
  assert.throws(() => selectSnapshotRowsForReadback({
    expectedRows,
    observedRows: [...observedRows, { id: 'unexpected-user', role: 'Admin' }],
    primaryKey: ['id'],
    preservedPrimaryKeys: [['pdm-local-test-admin-user']]
  }), { code: 'DEV128_TARGET_UNEXPECTED_LOCAL_ROW' })
})
