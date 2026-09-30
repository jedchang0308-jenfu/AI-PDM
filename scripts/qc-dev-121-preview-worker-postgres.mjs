#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-preview-worker-'))
assert.ok(taskRoot.startsWith(`${tempRoot}${path.sep}`))
const cluster = path.join(taskRoot, 'cluster')
const repositoryRoot = path.join(taskRoot, 'repository')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
let port
let admin
let workerOne
let workerTwo
let started = false
let stopped = false
let released = false
let tempRemoved = false
const checks = []

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, {
    cwd: root, encoding: 'utf8', windowsHide: true, ...options
  })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
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

async function check(name, action) {
  await action()
  checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 preview worker Principal provenance and PostgreSQL claim race',
    port, owningProcessTree: 'qc-dev-121-preview-worker-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'clients closed, cluster stopped, port released, temporary root removed',
    mutationScope: taskRoot, productionWrites: false
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust',
    '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'],
    { stdio: 'ignore' })
  started = true
  admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query(`
    CREATE ROLE dev121_preview_runtime LOGIN;
    CREATE SCHEMA ai_pdm_core;
    CREATE TABLE ai_pdm_core.drawing_revisions (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE ai_pdm_core.numbering_candidate_revision_drafts
      (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE ai_pdm_core.drawing_numbers (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE ai_pdm_core.part_numbers (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE ai_pdm_core.file_assets (
      id text PRIMARY KEY, linked_entity_type text NOT NULL,
      linked_entity_id text NOT NULL, deleted_at timestamptz,
      storage_key text, original_path text
    );
    CREATE TABLE ai_pdm_core.preview_jobs (
      id text PRIMARY KEY, company_id text NOT NULL,
      source_file_asset_id text NOT NULL, source_content_hash text NOT NULL,
      requested_kind text NOT NULL, source_extension text NOT NULL,
      status text NOT NULL, priority integer NOT NULL DEFAULT 100,
      attempt_count integer NOT NULL DEFAULT 0, idempotency_key text NOT NULL UNIQUE,
      generator_profile text NOT NULL, error_code text, error_summary text,
      created_by text, created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL, completed_at timestamptz,
      metadata_json text NOT NULL, locked_by text, locked_at timestamptz
    );
    CREATE TABLE ai_pdm_core.file_derivatives (
      id text PRIMARY KEY, company_id text NOT NULL,
      source_file_asset_id text NOT NULL, source_content_hash text NOT NULL,
      derivative_kind text NOT NULL, storage_provider text NOT NULL,
      storage_key text NOT NULL, original_path text, file_name text NOT NULL,
      mime_type text NOT NULL, file_size integer NOT NULL, content_hash text NOT NULL,
      hash_algorithm text NOT NULL, width integer, height integer, page_count integer,
      generator_profile text NOT NULL, generator_version text,
      preview_job_id text NOT NULL, status text NOT NULL,
      created_at timestamptz NOT NULL, created_by_worker text,
      metadata_json text NOT NULL
    );
    GRANT USAGE ON SCHEMA ai_pdm_core TO dev121_preview_runtime;
    GRANT SELECT ON ALL TABLES IN SCHEMA ai_pdm_core TO dev121_preview_runtime;
    GRANT UPDATE ON ai_pdm_core.preview_jobs TO dev121_preview_runtime;
    GRANT SELECT, INSERT, UPDATE ON ai_pdm_core.file_derivatives TO dev121_preview_runtime;
    INSERT INTO ai_pdm_core.drawing_revisions VALUES ('revision-one','company-one');
    INSERT INTO ai_pdm_core.file_assets
      (id,linked_entity_type,linked_entity_id,storage_key)
      VALUES ('asset-one','drawing_revision','revision-one','source/one');
    INSERT INTO ai_pdm_core.preview_jobs
      (id,company_id,source_file_asset_id,source_content_hash,requested_kind,
       source_extension,status,idempotency_key,generator_profile,created_by,
       created_at,updated_at,metadata_json)
      VALUES ('job-one','company-one','asset-one',repeat('a',64),
       'native_thumbnail_png','slddrw','queued','job-one-key','fake_preview_worker',
       'profile-one',now(),now(),
       '{"initiator":{"kind":"verified_principal","principalId":"principal-one"}}');
  `)
  process.env.PDM_REPOSITORY_DIR = repositoryRoot
  process.env.PDM_STORAGE_PROVIDER = 'local_repository'
  const [{ createAsyncDatabaseClient }, { claimPreviewJobAsync, completePreviewJobAsync,
    heartbeatPreviewJobAsync }] = await Promise.all([
    import('../src/lib/db-async-provider.ts'), import('../src/lib/preview-derivatives.ts')
  ])
  const connectionString = `postgresql://dev121_preview_runtime@127.0.0.1:${port}/postgres`
  const config = { kind: 'postgres', connectionString,
    searchPath: 'ai_pdm_core,pg_catalog', maxConnections: 1, statementTimeoutMillis: 3000 }
  workerOne = createAsyncDatabaseClient(config)
  workerTwo = createAsyncDatabaseClient(config)
  const claim = (worker, workerId) => claimPreviewJobAsync(worker, {
    workerId, supportedKinds: ['native_thumbnail_png'], supportedExtensions: ['slddrw']
  })
  await check('SKIP LOCKED does not wait for a job held by another transaction', async () => {
    await admin.query('BEGIN')
    try {
      await admin.query(`SELECT id FROM ai_pdm_core.preview_jobs
        WHERE id='job-one' FOR UPDATE`)
      const result = await claim(workerOne, 'worker-one')
      assert.equal(result, null)
    } finally {
      await admin.query('ROLLBACK')
    }
  })
  await check('two PostgreSQL workers claim the queued job only once', async () => {
    const results = await Promise.all([claim(workerOne, 'worker-one'),
      claim(workerTwo, 'worker-two')])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(results.find(Boolean).jobId, 'job-one')
    const job = (await admin.query(`SELECT status,attempt_count,locked_by,
      created_by,metadata_json FROM ai_pdm_core.preview_jobs WHERE id='job-one'`)).rows[0]
    assert.equal(job.status, 'running')
    assert.equal(job.attempt_count, 1)
    assert.equal(job.created_by, 'profile-one')
    assert.deepEqual(JSON.parse(job.metadata_json).initiator,
      { kind: 'verified_principal', principalId: 'principal-one' })
    assert.ok(['worker-one', 'worker-two'].includes(job.locked_by))
  })
  await check('heartbeat acknowledges only the current claim holder', async () => {
    const holder = (await admin.query(`SELECT locked_by FROM ai_pdm_core.preview_jobs
      WHERE id='job-one'`)).rows[0].locked_by
    const other = holder === 'worker-one' ? 'worker-two' : 'worker-one'
    assert.equal(await heartbeatPreviewJobAsync(workerOne, {
      jobId: 'job-one', workerId: other }), false)
    assert.equal(await heartbeatPreviewJobAsync(workerOne, {
      jobId: 'job-one', workerId: holder }), true)
  })
  await check('only the claim holder can complete and a late failure cannot overwrite success', async () => {
    const holder = (await admin.query(`SELECT locked_by FROM ai_pdm_core.preview_jobs
      WHERE id='job-one'`)).rows[0].locked_by
    const other = holder === 'worker-one' ? 'worker-two' : 'worker-one'
    const refused = await completePreviewJobAsync(workerTwo, {
      jobId: 'job-one', workerId: other, status: 'succeeded',
      sourceContentHash: 'a'.repeat(64), derivatives: []
    })
    assert.deepEqual(refused, { accepted: false, derivativeIds: [] })
    const accepted = await completePreviewJobAsync(workerOne, {
      jobId: 'job-one', workerId: holder, status: 'succeeded',
      sourceContentHash: 'a'.repeat(64), derivatives: []
    })
    assert.deepEqual(accepted, { accepted: true, derivativeIds: [] })
    const lateFailure = await completePreviewJobAsync(workerTwo, {
      jobId: 'job-one', workerId: holder, status: 'failed',
      errorCode: 'late_error', errorSummary: 'late failure'
    })
    assert.deepEqual(lateFailure, { accepted: false, derivativeIds: [] })
    const final = (await admin.query(`SELECT status,error_code FROM ai_pdm_core.preview_jobs
      WHERE id='job-one'`)).rows[0]
    assert.deepEqual(final, { status: 'succeeded', error_code: null })
  })
  await check('worker rejects a job labeled with a different company than its source', async () => {
    await admin.query(`INSERT INTO ai_pdm_core.preview_jobs
      (id,company_id,source_file_asset_id,source_content_hash,requested_kind,
       source_extension,status,idempotency_key,generator_profile,created_by,
       created_at,updated_at,metadata_json)
      VALUES ('job-other','company-other','asset-one',repeat('a',64),
       'native_thumbnail_png','slddrw','queued','job-other-key','fake_preview_worker',
       'profile-one',now(),now(),
       '{"initiator":{"kind":"verified_principal","principalId":"principal-one"}}')`)
    assert.equal(await claim(workerOne, 'worker-one'), null)
    const job = (await admin.query(`SELECT status,error_code FROM ai_pdm_core.preview_jobs
      WHERE id='job-other'`)).rows[0]
    assert.deepEqual(job, { status: 'failed', error_code: 'source_company_scope_invalid' })
  })
  await check('claimed worker writes derivative bytes and Principal provenance stays on the job', async () => {
    await admin.query(`INSERT INTO ai_pdm_core.preview_jobs
      (id,company_id,source_file_asset_id,source_content_hash,requested_kind,
       source_extension,status,idempotency_key,generator_profile,created_by,
       created_at,updated_at,metadata_json)
      VALUES ('job-file','company-one','asset-one',repeat('a',64),
       'native_thumbnail_png','slddrw','queued','job-file-key','fake_preview_worker',
       'profile-one',now(),now(),
       '{"initiator":{"kind":"verified_principal","principalId":"principal-one"}}')`)
    const claimed = await claim(workerOne, 'worker-file')
    assert.equal(claimed.jobId, 'job-file')
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fOQAAAAASUVORK5CYII=', 'base64')
    const result = await completePreviewJobAsync(workerOne, {
      jobId: 'job-file', workerId: 'worker-file', status: 'succeeded',
      sourceContentHash: 'a'.repeat(64), derivatives: [{
        kind: 'thumbnail_png', fileName: 'preview.png', mimeType: 'image/png',
        contentBase64: bytes.toString('base64'), width: 1, height: 1,
        generatorProfile: 'fake_preview_worker'
      }]
    })
    assert.equal(result.accepted, true)
    assert.equal(result.derivativeIds.length, 1)
    const derivative = (await admin.query(`SELECT company_id,source_file_asset_id,
      storage_provider,storage_key,original_path,content_hash,status,created_by_worker
      FROM ai_pdm_core.file_derivatives WHERE preview_job_id='job-file'`)).rows[0]
    assert.equal(derivative.company_id, 'company-one')
    assert.equal(derivative.source_file_asset_id, 'asset-one')
    assert.equal(derivative.storage_provider, 'local_repository')
    assert.equal(derivative.status, 'ready')
    assert.equal(derivative.created_by_worker, 'worker-file')
    assert.ok(path.resolve(derivative.original_path).startsWith(repositoryRoot + path.sep))
    assert.deepEqual(fs.readFileSync(derivative.original_path), bytes)
    assert.equal(derivative.content_hash, crypto.createHash('sha256').update(bytes).digest('hex'))
    const job = (await admin.query(`SELECT status,created_by,metadata_json FROM
      ai_pdm_core.preview_jobs WHERE id='job-file'`)).rows[0]
    assert.equal(job.status, 'succeeded')
    assert.equal(job.created_by, 'profile-one')
    assert.deepEqual(JSON.parse(job.metadata_json).initiator,
      { kind: 'verified_principal', principalId: 'principal-one' })
  })
} finally {
  if (workerOne) await workerOne.close().catch(() => undefined)
  if (workerTwo) await workerTwo.close().catch(() => undefined)
  if (admin) await admin.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'],
      { stdio: 'ignore' }); stopped = true } catch { stopped = false }
  } else stopped = true
  if (port) released = await portReleased(port)
  if (stopped && released) {
    fs.rmSync(taskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(taskRoot)
  }
  process.stdout.write(`${JSON.stringify({ runner: 'DEV-121 preview worker PostgreSQL',
    checks, productionWrites: false, cleanup: { stopped, released, tempRemoved },
    retainedTempPath: tempRemoved ? null : taskRoot })}\n`)
}
