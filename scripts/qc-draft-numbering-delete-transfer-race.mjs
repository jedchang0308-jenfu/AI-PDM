#!/usr/bin/env node

// Isolated SSI proof for the race between permanent draft-bundle deletion and
// transfer-package references. The schema below is a minimal test-only model,
// not the AI-PDM application schema or a production-data acceptance test.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempBase = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempBase, 'aipdm-draft-delete-ssi-'))
assert.ok(path.relative(tempBase, taskRoot) && !path.relative(tempBase, taskRoot).startsWith('..'),
  'cluster path must be a task-owned TEMP child')
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
let port
let clusterStarted = false
let clusterStopped = false
let pool
let observer

function native(name, args, options = {}) {
  const executable = path.join(bin, process.platform === 'win32' ? `${name}.exe` : name)
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 45_000,
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', ...options
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`)
  }
  return String(result.stdout ?? '').trim()
}

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : selected ? resolve(selected) : reject(new Error('PORT_ALLOCATION_FAILED')))
    })
  })
}

async function waitFor(promise, label) {
  let timer
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), 10_000) })
    ])
  } finally { clearTimeout(timer) }
}

async function portReleased(value) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

function mark(name) {
  checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}

async function reset(id, includePackage) {
  await observer.query('TRUNCATE ssi_fixture.transfer_package_items, ssi_fixture.transfer_packages, ssi_fixture.draft_roots')
  await observer.query('INSERT INTO ssi_fixture.draft_roots(id, company_id, record_status) VALUES ($1, $2, $3)',
    [id, 'company-test', 'Draft'])
  if (includePackage) {
    await observer.query('INSERT INTO ssi_fixture.transfer_packages(id, company_id, package_status, row_version) VALUES ($1, $2, $3, 1)',
      [`pkg-${id}`, 'company-test', 'Draft'])
  }
}

async function readState(id) {
  const roots = await observer.query('SELECT id FROM ssi_fixture.draft_roots WHERE id=$1', [id])
  const items = await observer.query(`SELECT item.id, item.package_id, package.row_version
    FROM ssi_fixture.transfer_package_items item
    JOIN ssi_fixture.transfer_packages package ON package.id=item.package_id
    WHERE item.entity_id=$1 ORDER BY item.id`, [id])
  return { rootExists: roots.rowCount === 1, items: items.rows.map((row) => ({
    id: row.id, packageId: row.package_id, packageVersion: Number(row.row_version)
  })) }
}

async function addReference(id, mode, beforeInsert) {
  let attempts = 0
  const result = await pool.transaction(async (tx) => {
    attempts += 1
    const target = await tx.queryOne('SELECT id FROM ssi_fixture.draft_roots WHERE id=:id AND company_id=:companyId',
      { id, companyId: 'company-test' })
    if (!target) throw new Error('TEST_TARGET_NOT_FOUND')
    const packageId = `pkg-${id}`
    if (mode === 'create') {
      const exists = await tx.queryOne('SELECT id FROM ssi_fixture.transfer_packages WHERE id=:id', { id: packageId })
      if (exists) throw new Error('TEST_PACKAGE_ALREADY_EXISTS')
    } else {
      const pkg = await tx.queryOne('SELECT id, row_version FROM ssi_fixture.transfer_packages WHERE id=:id', { id: packageId })
      if (!pkg) throw new Error('TEST_PACKAGE_NOT_FOUND')
    }
    if (attempts === 1 && beforeInsert) await beforeInsert()
    if (mode === 'create') {
      await tx.execute(`INSERT INTO ssi_fixture.transfer_packages(id, company_id, package_status, row_version)
        VALUES (:id, :companyId, 'Draft', 1)`, { id: packageId, companyId: 'company-test' })
    }
    await tx.execute(`INSERT INTO ssi_fixture.transfer_package_items(id, company_id, package_id, entity_id)
      VALUES (:id, :companyId, :packageId, :entityId)`, {
      id: `item-${id}`, companyId: 'company-test', packageId, entityId: id
    })
    if (mode === 'add') {
      await tx.execute(`UPDATE ssi_fixture.transfer_packages SET row_version=row_version+1
        WHERE id=:packageId AND row_version=1`, { packageId })
    }
    return { packageId }
  }, { serializable: true })
  return { ...result, attempts }
}

async function deleteBundle(id, afterReferenceSnapshot, injectFailure = false) {
  let attempts = 0
  return await pool.transaction(async (tx) => {
    attempts += 1
    const before = await tx.queryOne('SELECT id FROM ssi_fixture.draft_roots WHERE id=:id AND company_id=:companyId',
      { id, companyId: 'company-test' })
    if (!before) throw new Error('TEST_TARGET_NOT_FOUND')
    const snapshotItems = await tx.query(`SELECT id, package_id FROM ssi_fixture.transfer_package_items
      WHERE entity_id=:id ORDER BY package_id, id`, { id })
    if (attempts === 1 && afterReferenceSnapshot) await afterReferenceSnapshot()

    // Mirrors delete's target-row lock + fresh logical checks. The SSI snapshot
    // remains fixed; a concurrent reference committed after this read forces
    // serialization retry, where the new reference is observed and cleaned.
    await tx.queryOne('SELECT id FROM ssi_fixture.draft_roots WHERE id=:id AND company_id=:companyId FOR UPDATE',
      { id, companyId: 'company-test' })
    const currentRoot = await tx.queryOne('SELECT id FROM ssi_fixture.draft_roots WHERE id=:id AND company_id=:companyId',
      { id, companyId: 'company-test' })
    if (!currentRoot) throw new Error('TEST_TARGET_NOT_FOUND')
    const currentItems = await tx.query(`SELECT id, package_id FROM ssi_fixture.transfer_package_items
      WHERE entity_id=:id ORDER BY package_id, id`, { id })
    // Use the fresh snapshot after a provider retry; on attempt 1 the rows are
    // the same snapshotItems. Keep this variable to assert the caller did read.
    assert.ok(Array.isArray(snapshotItems))
    for (const item of currentItems) {
      await tx.execute('DELETE FROM ssi_fixture.transfer_package_items WHERE id=:id', { id: item.id })
      await tx.execute(`UPDATE ssi_fixture.transfer_packages SET row_version=row_version+1
        WHERE id=:id`, { id: item.package_id })
    }
    await tx.execute('DELETE FROM ssi_fixture.draft_roots WHERE id=:id AND company_id=:companyId',
      { id, companyId: 'company-test' })
    await tx.execute('INSERT INTO ssi_fixture.delete_audit(root_id, attempt) VALUES (:id, :attempt)', { id, attempt: attempts })
    if (injectFailure) throw new Error('INJECTED_AFTER_REFERENCES_AND_ROOT')
    return { attempts, removedReferences: currentItems.length }
  }, { serializable: true })
}

async function raceAddWinsFirst({ id, mode, includePackage }) {
  await reset(id, includePackage)
  const deleteSnapshot = deferred(), allowDelete = deferred()
  const deletion = deleteBundle(id, async () => {
    deleteSnapshot.resolve()
    await allowDelete.promise
  })
  await waitFor(deleteSnapshot.promise, `${mode}_DELETE_SNAPSHOT`)
  const added = await addReference(id, mode)
  allowDelete.resolve()
  const deleted = await deletion
  const state = await readState(id)
  assert.ok(added.attempts >= 1)
  assert.ok(deleted.attempts >= 2, 'deletion must retry after its stale serializable reference snapshot')
  assert.equal(deleted.removedReferences, 1)
  assert.deepEqual(state, { rootExists: false, items: [] }, 'delete retry must remove the newly committed reference atomically')
  mark(`${mode}: reference commits first; delete retries, removes link, then deletes target`)
}

async function raceDeleteWinsFirst({ id, mode, includePackage }) {
  await reset(id, includePackage)
  const writerRead = deferred(), allowInsert = deferred()
  const addition = addReference(id, mode, async () => {
    writerRead.resolve()
    await allowInsert.promise
  })
  await waitFor(writerRead.promise, `${mode}_WRITER_READ`)
  const deleted = await deleteBundle(id)
  allowInsert.resolve()
  await assert.rejects(addition, (error) => error instanceof Error && error.message === 'TEST_TARGET_NOT_FOUND')
  const state = await readState(id)
  assert.equal(deleted.removedReferences, 0)
  assert.equal(state.rootExists, false)
  assert.deepEqual(state.items, [], 'stale writer retry must not leave a dangling transfer reference')
  const packageRows = await observer.query('SELECT id FROM ssi_fixture.transfer_packages WHERE id=$1', [`pkg-${id}`])
  assert.equal(packageRows.rowCount, includePackage ? 1 : 0)
  mark(`${mode}: delete commits first; stale writer retries and cannot create a reference`)
}

try {
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb')),
    `PostgreSQL initdb not found in ${bin}`)
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')),
    `PostgreSQL pg_ctl not found in ${bin}`)
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: 'Draft bundle deletion vs transfer-reference SSI race; minimal synthetic PostgreSQL fixture only',
    port,
    owningProcessTree: `qc-draft-numbering-delete-transfer-race.mjs -> ${path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')} -D ${cluster}`,
    cleanupCondition: 'close provider/observer, stop exact cluster, verify loopback port released, remove exact TEMP root',
    mutationScope: taskRoot,
    productionWrites: false
  } })}\n`)
  native('initdb', ['-D', cluster, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale', '--no-sync'])
  native('pg_ctl', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1 -c max_connections=12`, '-w', 'start'])
  clusterStarted = true

  const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`
  const { createAsyncDatabaseClient } = await import(pathToFileURL(path.join(root, 'src/lib/db-async-provider.ts')).href)
  pool = createAsyncDatabaseClient({ kind: 'postgres', connectionString, maxConnections: 6,
    connectionTimeoutMillis: 5000, statementTimeoutMillis: 5000, queryTimeoutMillis: 5000,
    applicationName: 'aipdm-draft-delete-ssi-qc' })
  observer = new pg.Client({ connectionString, application_name: 'aipdm-draft-delete-ssi-observer' })
  await observer.connect()
  await observer.query(`
    CREATE SCHEMA ssi_fixture;
    CREATE TABLE ssi_fixture.draft_roots (
      id text PRIMARY KEY, company_id text NOT NULL, record_status text NOT NULL
    );
    CREATE TABLE ssi_fixture.transfer_packages (
      id text PRIMARY KEY, company_id text NOT NULL, package_status text NOT NULL,
      row_version integer NOT NULL CHECK (row_version > 0)
    );
    CREATE TABLE ssi_fixture.transfer_package_items (
      id text PRIMARY KEY, company_id text NOT NULL,
      package_id text NOT NULL REFERENCES ssi_fixture.transfer_packages(id),
      entity_id text NOT NULL, UNIQUE(package_id, entity_id)
    );
    CREATE TABLE ssi_fixture.delete_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, root_id text NOT NULL, attempt integer NOT NULL
    );
  `)

  await raceAddWinsFirst({ id: 'create-first', mode: 'create', includePackage: false })
  await raceDeleteWinsFirst({ id: 'delete-before-create', mode: 'create', includePackage: false })
  await raceAddWinsFirst({ id: 'add-first', mode: 'add', includePackage: true })
  await raceDeleteWinsFirst({ id: 'delete-before-add', mode: 'add', includePackage: true })

  await reset('rollback-target', true)
  await observer.query(`INSERT INTO ssi_fixture.transfer_package_items(id, company_id, package_id, entity_id)
    VALUES ('item-rollback-target', 'company-test', 'pkg-rollback-target', 'rollback-target')`)
  await observer.query('UPDATE ssi_fixture.transfer_packages SET row_version=2 WHERE id=$1', ['pkg-rollback-target'])
  const beforeRollback = await readState('rollback-target')
  await assert.rejects(deleteBundle('rollback-target', null, true),
    (error) => error instanceof Error && error.message === 'INJECTED_AFTER_REFERENCES_AND_ROOT')
  const afterRollback = await readState('rollback-target')
  const auditRows = await observer.query('SELECT root_id FROM ssi_fixture.delete_audit WHERE root_id=$1', ['rollback-target'])
  assert.deepEqual(afterRollback, beforeRollback, 'root, package reference and version must roll back together')
  assert.equal(afterRollback.rootExists, true)
  assert.equal(afterRollback.items.length, 1)
  assert.equal(afterRollback.items[0].packageVersion, 2)
  assert.equal(auditRows.rowCount, 0, 'audit row must roll back with bundle/reference writes')
  mark('injected failure rolls back target, reference, package version and audit atomically')

  process.stdout.write(`QC_DRAFT_DELETE_TRANSFER_SSI=PASS (${checks.length}/${checks.length}; real PostgreSQL transaction provider; synthetic fixture only)\n`)
} finally {
  try { await pool?.close() } catch {}
  try { await observer?.end() } catch {}
  if (clusterStarted) {
    native('pg_ctl', ['-D', cluster, '-m', 'fast', '-t', '30', '-w', 'stop'])
    clusterStopped = true
    assert.equal(await portReleased(port), true, 'task-owned PostgreSQL loopback port must be released')
  } else {
    clusterStopped = true
  }
  if (clusterStopped) fs.rmSync(taskRoot, { recursive: true, force: true })
}
