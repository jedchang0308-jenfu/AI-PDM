import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'
import { insertTableRows, inspectSourceSessions, readCatalog, readTargetRows } from './dev012-production-data-cutover-runtime.mjs'
import { summarizeRows } from './lib/dev012-production-data-cutover.mjs'

const { Client } = pg

test('isolated PostgreSQL proves serializable import, non-deferrable self-FK convergence and replay', async () => {
  assert.equal(process.env.DEV012_ISOLATED_POSTGRES, '1', 'DEV012_POSTGRES_TEST_REQUIRES_TASK_OWNED_CLUSTER')
  const url = new URL(process.env.PDM_POSTGRES_URL ?? '')
  assert.equal(url.hostname, '127.0.0.1')
  const database = new Client({ connectionString: url.toString(), application_name: 'dev012-data-cutover-isolated-qc' })
  const schema = `dev012_cutover_${process.pid}`
  assert.match(schema, /^dev012_cutover_[0-9]+$/u)
  await database.connect()
  try {
    const identity = (await database.query('SELECT current_database() AS database, current_setting(\'server_version_num\')::integer / 10000 AS major')).rows[0]
    assert.equal(identity.database, 'postgres')
    assert.ok(identity.major >= 17)
    await database.query(`CREATE SCHEMA "${schema}"`)
    await database.query(`CREATE TABLE "${schema}".nodes (id text PRIMARY KEY, parent_id text NULL, payload text NOT NULL, CONSTRAINT nodes_parent_fk FOREIGN KEY(parent_id) REFERENCES "${schema}".nodes(id) NOT DEFERRABLE)`)
    const sessions = await inspectSourceSessions(database)
    assert.equal(sessions.activeTransactionCount, 0)
    const catalog = await readCatalog(database, schema)
    assert.equal(catalog.tables.length, 1)
    assert.equal(catalog.foreignKeys.length, 1)
    assert.equal(catalog.foreignKeys[0].deferrable, false)
    const table = catalog.tables[0]
    assert.deepEqual(table.primaryKey, ['id'])
    assert.deepEqual(catalog.foreignKeys[0].childColumns, ['parent_id'])
    assert.deepEqual(catalog.foreignKeys[0].parentColumns, ['id'])
    const rows = [{ id: 'child', parent_id: 'parent', payload: 'B' }, { id: 'parent', parent_id: null, payload: 'A' }]
    await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    const inserted = await insertTableRows(database, { target: { schema } }, table, rows)
    const observed = await readTargetRows(database, { target: { schema } }, table)
    assert.deepEqual(summarizeRows(observed, table.primaryKey), summarizeRows(rows, table.primaryKey))
    await database.query('COMMIT')
    assert.equal(inserted, 2)
    await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    assert.equal(await insertTableRows(database, { target: { schema } }, table, rows), 0)
    await database.query('COMMIT')
    assert.deepEqual(await readTargetRows(database, { target: { schema } }, table), [{ id: 'child', parent_id: 'parent', payload: 'B' }, { id: 'parent', parent_id: null, payload: 'A' }])
  } finally {
    await database.query('ROLLBACK').catch(() => undefined)
    await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined)
    await database.end()
  }
})
