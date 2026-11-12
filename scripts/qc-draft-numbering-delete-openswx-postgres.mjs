#!/usr/bin/env node

// Execute the exact forward migration against a disposable native PostgreSQL
// cluster. The small fixture schema is synthetic and is not production data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(root, 'db/postgres/102_draft_numbering_delete_terminal_openswx.sql')
const tempBase = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempBase, 'aipdm-draft-delete-openswx-'))
assert.ok(path.relative(tempBase, taskRoot) && !path.relative(tempBase, taskRoot).startsWith('..'),
  'cluster directory must be a task-owned TEMP child')
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
const { Client } = pg
let port
let clusterStarted = false
let clusterStopped = false
let admin
let database

function native(name, args) {
  const executable = path.join(bin, process.platform === 'win32' ? `${name}.exe` : name)
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 45_000,
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe'
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`)
  }
  return String(result.stdout ?? '').trim()
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

async function clearFixture() {
  await admin.query(`TRUNCATE ai_pdm_core.openswx_metadata_jobs, ai_pdm_core.drawing_revisions,
    ai_pdm_core.drawings, ai_pdm_core.drawing_numbers, ai_pdm_core.part_roots`)
}

async function seedScope({ rootStatus = 'Draft', drawingStatus = 'Draft', revisionState = 'preparing' } = {}) {
  await clearFixture()
  await admin.query('INSERT INTO ai_pdm_core.part_roots(company_id,id,record_status) VALUES ($1,$2,$3)',
    ['company-a', 'root-a', rootStatus])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_numbers(company_id,id,part_root_id,record_status)
    VALUES ($1,$2,$3,$4)`, ['company-a', 'dn-a', 'root-a', drawingStatus])
  await admin.query('INSERT INTO ai_pdm_core.drawings(company_id,id,part_root_id) VALUES ($1,$2,$3)',
    ['company-a', 'drawing-a', 'root-a'])
  await admin.query(`INSERT INTO ai_pdm_core.drawing_revisions(company_id,id,drawing_id,lifecycle_state)
    VALUES ($1,$2,$3,$4)`, ['company-a', 'revision-a', 'drawing-a', revisionState])
}

async function seedJob({ company = 'company-a', id, drawingNumber = null, revision = null,
  status = 'completed', dispatch = 'terminal' }) {
  await admin.query(`INSERT INTO ai_pdm_core.openswx_metadata_jobs
    (company_id,id,drawing_number_id,drawing_revision_id,status,dispatch_state)
    VALUES ($1,$2,$3,$4,$5,$6)`, [company, id, drawingNumber, revision, status, dispatch])
}

async function callDelete({ company = 'company-a', root = 'root-a', isolationLevel = 'serializable' } = {}) {
  return await database.transaction(async (tx) => {
    await tx.execute('SET LOCAL ROLE jenfu_ai_pdm_runtime')
    const result = await tx.queryOne(`SELECT ai_pdm_core.delete_draft_bundle_terminal_openswx_v1(
      :companyId, :rootId) AS removed`, { companyId: company, rootId: root })
    return Number(result?.removed)
  }, { isolationLevel })
}

try {
  assert.ok(fs.existsSync(migrationPath), `migration file missing: ${migrationPath}`)
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb')),
    `PostgreSQL initdb not found in ${bin}`)
  assert.ok(fs.existsSync(path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')),
    `PostgreSQL pg_ctl not found in ${bin}`)

  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: 'Migration 102 SECURITY DEFINER OpenSWX cleanup, terminal-state guard, transaction-isolation guard and privilege boundary',
    port,
    owningProcessTree: `qc-draft-numbering-delete-openswx-postgres.mjs -> ${path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')} -D ${cluster}`,
    cleanupCondition: 'close clients, stop exact cluster, verify loopback port released, remove exact TEMP root',
    mutationScope: taskRoot,
    productionWrites: false,
    fixture: 'minimal synthetic ai_pdm_core tables and disposable roles'
  } })}\n`)
  native('initdb', ['-D', cluster, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale', '--no-sync'])
  native('pg_ctl', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1 -c max_connections=12`, '-w', 'start'])
  clusterStarted = true

  const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`
  admin = new Client({ connectionString, application_name: 'aipdm-draft-delete-openswx-admin' })
  await admin.connect()
  await admin.query(`
    CREATE ROLE jenfu_ai_pdm_migrator;
    CREATE ROLE jenfu_ai_pdm_runtime;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.part_roots (
      company_id text NOT NULL, id text NOT NULL, record_status text NOT NULL,
      PRIMARY KEY(company_id,id)
    );
    CREATE TABLE ai_pdm_core.drawing_numbers (
      company_id text NOT NULL, id text NOT NULL, part_root_id text NOT NULL, record_status text NOT NULL,
      PRIMARY KEY(company_id,id),
      FOREIGN KEY(company_id,part_root_id) REFERENCES ai_pdm_core.part_roots(company_id,id)
    );
    CREATE TABLE ai_pdm_core.drawings (
      company_id text NOT NULL, id text NOT NULL, part_root_id text NOT NULL,
      PRIMARY KEY(company_id,id),
      FOREIGN KEY(company_id,part_root_id) REFERENCES ai_pdm_core.part_roots(company_id,id)
    );
    CREATE TABLE ai_pdm_core.drawing_revisions (
      company_id text NOT NULL, id text NOT NULL, drawing_id text NOT NULL, lifecycle_state text NOT NULL,
      PRIMARY KEY(company_id,id),
      FOREIGN KEY(company_id,drawing_id) REFERENCES ai_pdm_core.drawings(company_id,id)
    );
    CREATE TABLE ai_pdm_core.openswx_metadata_jobs (
      company_id text NOT NULL, id text NOT NULL,
      drawing_number_id text, drawing_revision_id text,
      status text NOT NULL, dispatch_state text NOT NULL,
      PRIMARY KEY(company_id,id),
      FOREIGN KEY(company_id,drawing_number_id) REFERENCES ai_pdm_core.drawing_numbers(company_id,id),
      FOREIGN KEY(company_id,drawing_revision_id) REFERENCES ai_pdm_core.drawing_revisions(company_id,id)
    );
    RESET ROLE;
    GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
  `)

  await admin.query(fs.readFileSync(migrationPath, 'utf8'))
  const owner = await admin.query(`SELECT r.rolname AS owner FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='ai_pdm_core' AND p.proname='delete_draft_bundle_terminal_openswx_v1'`)
  assert.equal(owner.rows[0]?.owner, 'jenfu_ai_pdm_migrator', 'SECURITY DEFINER owner must be the migrator role')
  const privileges = await admin.query(`SELECT
    EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='ai_pdm_core' AND p.proname='delete_draft_bundle_terminal_openswx_v1'
        AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    ) AS public_execute,
    has_function_privilege('jenfu_ai_pdm_runtime', 'ai_pdm_core.delete_draft_bundle_terminal_openswx_v1(text,text)', 'EXECUTE') AS runtime_execute,
    has_table_privilege('jenfu_ai_pdm_runtime', 'ai_pdm_core.openswx_metadata_jobs', 'DELETE') AS runtime_table_delete`)
  assert.deepEqual(privileges.rows[0], { public_execute: false, runtime_execute: true, runtime_table_delete: false })
  mark('exact migration applies; owner, execute grants and no direct runtime DELETE are correct')

  const { createAsyncDatabaseClient } = await import(pathToFileURL(path.join(root, 'src/lib/db-async-provider.ts')).href)
  database = createAsyncDatabaseClient({ kind: 'postgres', connectionString, maxConnections: 5,
    connectionTimeoutMillis: 5000, statementTimeoutMillis: 5000, queryTimeoutMillis: 5000,
    applicationName: 'aipdm-draft-delete-openswx-qc' })

  await seedScope()
  await seedJob({ id: 'job-target-drawing-number', drawingNumber: 'dn-a' })
  await seedJob({ id: 'job-target-revision', revision: 'revision-a', status: 'failed' })
  await admin.query(`INSERT INTO ai_pdm_core.part_roots(company_id,id,record_status) VALUES ('company-a','root-other','Draft')`)
  await admin.query(`INSERT INTO ai_pdm_core.drawing_numbers(company_id,id,part_root_id,record_status)
    VALUES ('company-a','dn-other','root-other','Draft')`)
  await seedJob({ id: 'job-other-root', drawingNumber: 'dn-other' })
  await admin.query(`INSERT INTO ai_pdm_core.part_roots(company_id,id,record_status) VALUES ('company-b','root-a','Draft')`)
  await admin.query(`INSERT INTO ai_pdm_core.drawing_numbers(company_id,id,part_root_id,record_status)
    VALUES ('company-b','dn-a','root-a','Draft')`)
  await seedJob({ company: 'company-b', id: 'job-other-company', drawingNumber: 'dn-a' })
  assert.equal(await callDelete(), 2, 'only two terminal jobs attached to the exact company/root should be deleted')
  const remaining = await admin.query('SELECT company_id,id FROM ai_pdm_core.openswx_metadata_jobs ORDER BY company_id,id')
  assert.deepEqual(remaining.rows, [
    { company_id: 'company-a', id: 'job-other-root' },
    { company_id: 'company-b', id: 'job-other-company' }
  ])
  mark('deletes only terminal jobs attached to the exact company and draft root')

  await seedScope()
  await seedJob({ id: 'a-terminal-first', drawingNumber: 'dn-a' })
  await seedJob({ id: 'z-active-later', revision: 'revision-a', status: 'running', dispatch: 'dispatched' })
  await assert.rejects(callDelete(), (error) => error?.code === '23514' &&
    error.message === 'NUMBERING_DRAFT_DELETE_OPEN_SWX_ACTIVE')
  const activeRollback = await admin.query('SELECT id FROM ai_pdm_core.openswx_metadata_jobs ORDER BY id')
  assert.deepEqual(activeRollback.rows, [{ id: 'a-terminal-first' }, { id: 'z-active-later' }],
    'a terminal row deleted earlier in the function must roll back when an active job is encountered')
  mark('active/nonterminal worker rejects and rolls back earlier terminal-job deletion')

  await seedScope()
  await seedJob({ id: 'job-nonserializable', drawingNumber: 'dn-a' })
  await assert.rejects(callDelete({ isolationLevel: 'read_committed' }), (error) => error?.code === '23514' &&
    error.message === 'NUMBERING_DRAFT_DELETE_OPEN_SWX_SCOPE_INVALID')
  assert.equal((await admin.query(`SELECT id FROM ai_pdm_core.openswx_metadata_jobs WHERE id='job-nonserializable'`)).rowCount, 1)
  mark('nonserializable caller is rejected without deleting jobs')

  for (const [label, options] of [
    ['approved root', { rootStatus: 'Released' }],
    ['approved drawing number', { drawingStatus: 'Released' }],
    ['released revision', { revisionState: 'released' }]
  ]) {
    await seedScope(options)
    await seedJob({ id: `job-${label.replaceAll(' ', '-')}`, revision: 'revision-a' })
    await assert.rejects(callDelete(), (error) => error?.code === '23514' &&
      error.message === 'NUMBERING_DRAFT_DELETE_OPEN_SWX_SCOPE_INVALID', label)
    const count = await admin.query('SELECT count(*)::int AS count FROM ai_pdm_core.openswx_metadata_jobs')
    assert.equal(count.rows[0].count, 1, `${label} rejection must preserve the linked worker row`)
    mark(`${label} scope is rejected before worker cleanup`)
  }

  await assert.rejects(database.transaction(async (tx) => {
    await tx.execute('SET LOCAL ROLE jenfu_ai_pdm_runtime')
    await tx.execute(`DELETE FROM ai_pdm_core.openswx_metadata_jobs WHERE company_id='company-a'`)
  }), (error) => error?.code === '42501', 'runtime must not have direct DELETE on the worker table')
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM ai_pdm_core.openswx_metadata_jobs')).rows[0].count, 1)
  mark('direct runtime DELETE is denied; only the granted function can remove terminal rows')

  process.stdout.write(`QC_DRAFT_DELETE_OPEN_SWX_POSTGRES=PASS (${checks.length}/${checks.length}; exact migration; native PG; synthetic fixture only)\n`)
} finally {
  try { await database?.close() } catch {}
  try { await admin?.end() } catch {}
  if (clusterStarted) {
    native('pg_ctl', ['-D', cluster, '-m', 'fast', '-t', '30', '-w', 'stop'])
    clusterStopped = true
    assert.equal(await portReleased(port), true, 'task-owned PostgreSQL loopback port must be released')
  } else {
    clusterStopped = true
  }
  if (clusterStopped) fs.rmSync(taskRoot, { recursive: true, force: true })
}
