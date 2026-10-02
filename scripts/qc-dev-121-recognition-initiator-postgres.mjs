#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = fs.realpathSync.native(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-recognition-'))
assert.ok(fs.realpathSync.native(taskRoot).startsWith(`${tempRoot}${path.sep}`))
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const migrationPath = path.join(root, 'db/postgres/073_dev121_drawing_recognition_initiator_principal.sql')
const migration = fs.readFileSync(migrationPath)
const checks = []
let port
let admin
let runtime
let workerRuntime
let started = false
let stopped = false
let released = false
let tempRemoved = false

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, {
    cwd: root, encoding: 'utf8', windowsHide: true, ...options
  })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}

async function freePort() {
  return new Promise((resolve, reject) => {
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
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

async function check(label, action) {
  await action()
  checks.push(label)
  process.stdout.write(`PASS ${label}\n`)
}

async function rejectsWith(sql, code) {
  await assert.rejects(admin.query(sql), (error) => error.code === code)
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 recognition initiator Principal forward migration',
    port, owningProcessTree: 'qc-dev-121-recognition-initiator-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'client closed, cluster stopped, port released, temporary root removed',
    mutationScope: taskRoot, PDM_DATA_DIR: taskRoot,
    PDM_REPOSITORY_DIR: path.join(taskRoot, 'repository'), productionWrites: false
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust',
    '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'],
    { stdio: 'ignore' })
  started = true
  admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query(`
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE aipdm_test_runtime LOGIN;
    CREATE ROLE aipdm_test_worker LOGIN;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.principal_accounts (
      principal_id text PRIMARY KEY,company_id text NOT NULL,pdm_user_id text NOT NULL,
      UNIQUE(company_id,pdm_user_id,principal_id));
    CREATE TABLE ai_pdm_core.drawing_recognition_sessions (
      id text PRIMARY KEY,company_id text NOT NULL,created_by text NOT NULL,
      drawing_id text,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),priority integer NOT NULL DEFAULT 100,
      not_before timestamptz,attempt_count integer NOT NULL DEFAULT 0,
      heartbeat_at timestamptz,locked_by text,locked_at timestamptz,
      row_version integer NOT NULL DEFAULT 1,error_code text,error_summary text,
      warning_count integer NOT NULL DEFAULT 0,conflict_count integer NOT NULL DEFAULT 0,
      unclassified_count integer NOT NULL DEFAULT 0,
      source_set_fingerprint text NOT NULL DEFAULT 'fixture-fingerprint');
    CREATE TABLE ai_pdm_core.file_assets (
      id text PRIMARY KEY, original_path text,storage_provider text,storage_key text,
      storage_bucket text,deleted_at timestamptz);
    CREATE TABLE ai_pdm_core.drawing_recognition_sources (
      id text PRIMARY KEY,session_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sessions(id),
      company_id text NOT NULL,file_asset_id text NOT NULL REFERENCES ai_pdm_core.file_assets(id),
      content_hash text NOT NULL,file_name text NOT NULL,
      file_ext text NOT NULL,mime_type text NOT NULL,file_size bigint NOT NULL,
      source_role text NOT NULL,adapter_plan_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      sort_order integer NOT NULL DEFAULT 0);
    CREATE TABLE ai_pdm_core.drawing_recognition_adapter_results (
      id text PRIMARY KEY,session_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sessions(id),
      source_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sources(id),
      company_id text NOT NULL,adapter_code text NOT NULL,adapter_version text NOT NULL,
      status text NOT NULL,observation_count integer NOT NULL,diagnostics_json jsonb NOT NULL,
      started_at timestamptz NOT NULL,completed_at timestamptz NOT NULL);
    CREATE TABLE ai_pdm_core.drawing_recognition_observations (
      id text PRIMARY KEY,session_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sessions(id),
      source_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sources(id),
      adapter_result_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_adapter_results(id),
      company_id text NOT NULL,raw_text text NOT NULL,
      raw_value text,normalized_value text,location_kind text,page_number integer,
      sheet_name text,configuration_name text,geometry_json jsonb,confidence_band text,
      extractor_code text,extractor_version text,raw_payload_hash text,
      captured_at timestamptz NOT NULL);
    CREATE TABLE ai_pdm_core.drawing_recognition_candidates (
      id text PRIMARY KEY,session_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_sessions(id),
      company_id text NOT NULL,
      category text NOT NULL,field_key text,field_label text NOT NULL,
      raw_value text,proposed_value text,normalized_value text,
      proposed_owner_type text,proposed_owner_id text,applicability_scope text NOT NULL,
      variant_status text NOT NULL,confidence_band text NOT NULL,review_state text NOT NULL,
      current_formal_value text,current_formal_fingerprint text,group_key text NOT NULL,
      sort_order integer NOT NULL,row_version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
    CREATE TABLE ai_pdm_core.drawing_recognition_candidate_observations (
      candidate_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_candidates(id),
      observation_id text NOT NULL REFERENCES ai_pdm_core.drawing_recognition_observations(id),
      company_id text NOT NULL,
      created_at timestamptz NOT NULL,PRIMARY KEY(candidate_id,observation_id));
    CREATE TABLE ai_pdm_core.drawings (
      id text PRIMARY KEY,company_id text NOT NULL,owner_id text NOT NULL);
    CREATE TABLE ai_pdm_core.drawing_recognition_decisions (
      id text PRIMARY KEY,company_id text NOT NULL,actor_id text NOT NULL,
      note text NOT NULL DEFAULT 'original');
    CREATE TABLE ai_pdm_core.drawing_recognition_formalization_events (
      id text PRIMARY KEY,company_id text NOT NULL,actor_id text NOT NULL,
      note text NOT NULL DEFAULT 'original');
    INSERT INTO ai_pdm_core.drawings VALUES
      ('drawing-one','company-one','profile-one');
    INSERT INTO ai_pdm_core.drawing_recognition_decisions
      (id,company_id,actor_id) VALUES ('historical-decision','company-one','profile-one');
    INSERT INTO ai_pdm_core.drawing_recognition_formalization_events
      (id,company_id,actor_id) VALUES ('historical-event','company-one','profile-one');
    INSERT INTO ai_pdm_core.principal_accounts VALUES
      ('principal-one','company-one','profile-one'),
      ('principal-two','company-one','profile-two');
    INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,drawing_id,status)
      VALUES ('historical','company-one','profile-one','drawing-one','queued');
    INSERT INTO ai_pdm_core.file_assets
      (id,original_path,storage_provider,storage_key) VALUES
      ('asset-one','C:/task-owned/fixture.dwg','local_repository','fixture.dwg');
    RESET ROLE;
    GRANT USAGE ON SCHEMA ai_pdm_core TO aipdm_test_runtime;
    GRANT SELECT ON ai_pdm_core.principal_accounts,
      ai_pdm_core.drawing_recognition_sessions,
      ai_pdm_core.drawings TO aipdm_test_runtime;
    GRANT USAGE ON SCHEMA ai_pdm_core TO aipdm_test_worker;
    GRANT SELECT, UPDATE ON ai_pdm_core.drawing_recognition_sessions TO aipdm_test_worker;
    GRANT SELECT ON ai_pdm_core.drawing_recognition_sources,
      ai_pdm_core.file_assets TO aipdm_test_worker;
    GRANT SELECT, INSERT ON ai_pdm_core.drawing_recognition_adapter_results,
      ai_pdm_core.drawing_recognition_observations,
      ai_pdm_core.drawing_recognition_candidates,
      ai_pdm_core.drawing_recognition_candidate_observations TO aipdm_test_worker;
  `)
  await check('forward-only migration applies to owner schema', async () => {
    await admin.query(migration.toString('utf8'))
    const column = await admin.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='ai_pdm_core' AND table_name='drawing_recognition_sessions'
        AND column_name='initiator_principal_id'`)
    assert.equal(column.rowCount, 1)
  })
  await check('historical row with no Principal remains processable', async () => {
    await admin.query(`UPDATE ai_pdm_core.drawing_recognition_sessions
      SET status='review_ready' WHERE id='historical'`)
    const row = await admin.query(`SELECT status,initiator_principal_id
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='historical'`)
    assert.deepEqual(row.rows, [{ status: 'review_ready', initiator_principal_id: null }])
  })
  await check('new job without verified Principal is rejected', async () => {
    await rejectsWith(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,status) VALUES ('missing','company-one','profile-one','queued')`, '23514')
  })
  await check('wrong Principal/profile pair is rejected', async () => {
    await rejectsWith(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,status,initiator_principal_id)
      VALUES ('mismatch','company-one','profile-one','queued','principal-two')`, '23503')
  })
  await check('valid Principal/profile/company triplet is retained', async () => {
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,status,initiator_principal_id)
      VALUES ('current','company-one','profile-one','queued','principal-one')`)
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sources
      (id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,
       mime_type,file_size,source_role)
      VALUES ('source-one','current','company-one','asset-one','fixture-hash',
        'fixture.dwg','dwg','application/acad',1,'drawing_2d')`)
    const row = await admin.query(`SELECT company_id,created_by,initiator_principal_id
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='current'`)
    assert.deepEqual(row.rows, [{ company_id: 'company-one', created_by: 'profile-one',
      initiator_principal_id: 'principal-one' }])
  })
  await check('initiator security triplet cannot be rewritten', async () => {
    await rejectsWith(`UPDATE ai_pdm_core.drawing_recognition_sessions
      SET initiator_principal_id='principal-two',created_by='profile-two'
      WHERE id='current'`, '23514')
  })
  const auditTables = ['drawing_recognition_decisions',
    'drawing_recognition_formalization_events']
  await check('historical audit actors remain unknown and processable', async () => {
    for (const table of auditTables) {
      await admin.query(`UPDATE ai_pdm_core.${table} SET note='processed' WHERE id LIKE 'historical-%'`)
      const row = await admin.query(`SELECT actor_principal_id,note FROM ai_pdm_core.${table}
        WHERE id LIKE 'historical-%'`)
      assert.deepEqual(row.rows, [{ actor_principal_id: null, note: 'processed' }])
    }
  })
  await check('new audit events without Principal are rejected', async () => {
    for (const table of auditTables) {
      await rejectsWith(`INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id) VALUES ('missing','company-one','profile-one')`, '23514')
    }
  })
  await check('audit Principal must match company and historical profile', async () => {
    for (const table of auditTables) {
      await rejectsWith(`INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,actor_principal_id)
        VALUES ('mismatch','company-one','profile-one','principal-two')`, '23503')
    }
  })
  await check('new audit actors are retained and immutable', async () => {
    for (const table of auditTables) {
      await admin.query(`INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,actor_principal_id)
        VALUES ('current','company-one','profile-one','principal-one')`)
      const row = await admin.query(`SELECT actor_id,actor_principal_id FROM ai_pdm_core.${table}
        WHERE id='current'`)
      assert.deepEqual(row.rows, [{ actor_id: 'profile-one',
        actor_principal_id: 'principal-one' }])
      await rejectsWith(`UPDATE ai_pdm_core.${table}
        SET actor_id='profile-two',actor_principal_id='principal-two'
        WHERE id='current'`, '23514')
    }
  })
  const { createAsyncDatabaseClient } = await import(pathToFileURL(
    path.join(root, 'src/lib/db-async-provider.ts')).href)
  const { DrawingRecognitionAsyncRepository } = await import(pathToFileURL(
    path.join(root, 'src/lib/repositories/drawing-recognition-async-repository.ts')).href)
  runtime = createAsyncDatabaseClient({ kind: 'postgres',
    connectionString: `postgres://aipdm_test_runtime@127.0.0.1:${port}/postgres`,
    searchPath: 'ai_pdm_core', maxConnections: 1 })
  const repository = new DrawingRecognitionAsyncRepository(runtime)
  await check('real repository authorizes new session by initiator Principal', async () => {
    const row = await repository.assertSessionScope({ sessionId: 'current',
      companyId: 'company-one', actorId: 'unrelated-profile',
      principalId: 'principal-one', privileged: false })
    assert.equal(row.id, 'current')
  })
  await check('real repository rejects matching profile with wrong Principal', async () => {
    await assert.rejects(repository.assertSessionScope({ sessionId: 'current',
      companyId: 'company-one', actorId: 'profile-one',
      principalId: 'principal-two', privileged: false }),
    (error) => error.code === 'RECOGNITION_SESSION_FORBIDDEN')
  })
  await check('historical unknown initiator is readable by verified drawing owner', async () => {
    const row = await repository.assertSessionScope({ sessionId: 'historical',
      companyId: 'company-one', actorId: 'unrelated-profile',
      principalId: 'principal-one', privileged: false })
    assert.equal(row.id, 'historical')
  })
  workerRuntime = createAsyncDatabaseClient({ kind: 'postgres',
    connectionString: `postgres://aipdm_test_worker@127.0.0.1:${port}/postgres`,
    searchPath: 'ai_pdm_core', maxConnections: 1 })
  await check('restricted worker claims a new job without replacing its initiator Principal', async () => {
    const job = await new DrawingRecognitionAsyncRepository(workerRuntime).claimJob({
      workerId: 'worker-one', maxAttempts: 2, allowNativeSources: true
    })
    assert.equal(job.sessionId, 'current')
    assert.equal(job.initiatorPrincipalId, 'principal-one')
    const row = await admin.query(`SELECT initiator_principal_id,locked_by,status
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='current'`)
    assert.deepEqual(row.rows, [{ initiator_principal_id: 'principal-one',
      locked_by: 'worker-one', status: 'extracting' }])
  })
  await check('non-holder worker cannot write a result or displace the initiator', async () => {
    await assert.rejects(new DrawingRecognitionAsyncRepository(workerRuntime).completeJob({
      sessionId: 'current', workerId: 'worker-two',
      sourceSetFingerprint: 'fixture-fingerprint', results: []
    }), (error) => error.code === 'RECOGNITION_JOB_LOCK_INVALID')
    const row = await admin.query(`SELECT initiator_principal_id,locked_by,status
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='current'`)
    assert.deepEqual(row.rows, [{ initiator_principal_id: 'principal-one',
      locked_by: 'worker-one', status: 'extracting' }])
  })
  await check('restricted worker completes a recognition result and retains the human initiator', async () => {
    const projection = await new DrawingRecognitionAsyncRepository(workerRuntime).completeJob({
      sessionId: 'current', workerId: 'worker-one',
      sourceSetFingerprint: 'fixture-fingerprint',
      results: [{ sourceId: 'source-one', adapterCode: 'fixture-native',
        adapterVersion: '1', status: 'succeeded', observations: [{
          rawText: 'fixture note',rawValue: 'fixture note',
          normalizedValue: 'fixture note',category: 'unclassified',
          fieldKey: 'fixture_note',fieldLabel: '待歸類備註'
        }] }]
    })
    assert.equal(projection.status, 'review_ready')
    assert.equal(projection.candidates.length, 1)
    const row = await admin.query(`SELECT initiator_principal_id,locked_by,status
      FROM ai_pdm_core.drawing_recognition_sessions WHERE id='current'`)
    assert.deepEqual(row.rows, [{ initiator_principal_id: 'principal-one',
      locked_by: null, status: 'review_ready' }])
    const output = await admin.query(`SELECT
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_adapter_results) AS adapters,
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_observations) AS observations,
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_candidates) AS candidates`)
    assert.deepEqual(output.rows, [{ adapters: '1', observations: '1', candidates: '1' }])
  })
  await check('completed worker result cannot be replayed into duplicate business evidence', async () => {
    await assert.rejects(new DrawingRecognitionAsyncRepository(workerRuntime).completeJob({
      sessionId: 'current', workerId: 'worker-one',
      sourceSetFingerprint: 'fixture-fingerprint', results: []
    }), (error) => error.code === 'RECOGNITION_JOB_LOCK_INVALID')
    const output = await admin.query(`SELECT
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_adapter_results) AS adapters,
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_observations) AS observations,
      (SELECT COUNT(*) FROM ai_pdm_core.drawing_recognition_candidates) AS candidates`)
    assert.deepEqual(output.rows, [{ adapters: '1', observations: '1', candidates: '1' }])
  })
  await check('worker HTTP handlers preserve Principal through claim and completion', async () => {
    const repositoryDir = path.join(taskRoot, 'repository')
    fs.mkdirSync(repositoryDir, { recursive: true })
    const nativeBytes = Buffer.alloc(1_024, 0x42)
    fs.writeFileSync(path.join(repositoryDir, 'source-process.sldprt'), nativeBytes, { flag: 'wx' })
    const nativeHash = crypto.createHash('sha256').update(nativeBytes).digest('hex')
    const adapterScript = path.join(taskRoot, 'fixture-native-adapter.mjs')
    fs.writeFileSync(adapterScript, `import fs from 'node:fs';
import crypto from 'node:crypto';
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);
const bytes = fs.readFileSync(input.sourcePath);
if (crypto.createHash('sha256').update(bytes).digest('hex') !== input.contentHash) {
  throw new Error('fixture staged source hash mismatch');
}
process.stdout.write(JSON.stringify({
  schemaVersion: 'drawing-recognition-extractor.v1', status: 'succeeded',
  adapterVersion: 'task-owned-fixture-v1', observations: [{
    rawText: 'native source transferred', rawValue: 'native source transferred',
    normalizedValue: 'native source transferred', category: 'unclassified',
    fieldKey: 'fixture_note', fieldLabel: '待歸類備註'
  }]
}));
`)
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,status,initiator_principal_id)
      VALUES ('current-http','company-one','profile-one','queued','principal-one')`)
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sources
      (id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,
       mime_type,file_size,source_role)
      VALUES ('source-http','current-http','company-one','asset-one','fixture-hash',
        'fixture.dwg','dwg','application/acad',1,'drawing_2d')`)
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sessions
      (id,company_id,created_by,status,initiator_principal_id)
      VALUES ('current-process','company-one','profile-one','queued','principal-one')`)
    await admin.query(`INSERT INTO ai_pdm_core.file_assets
      (id,original_path,storage_provider,storage_key)
      VALUES ('asset-process',$1,'local_repository','source-process.sldprt')`,
      [path.join(repositoryDir, 'source-process.sldprt')])
    await admin.query(`INSERT INTO ai_pdm_core.drawing_recognition_sources
      (id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,
       mime_type,file_size,source_role)
      VALUES ('source-process','current-process','company-one','asset-process',$1,
        'source-process.sldprt','sldprt','application/octet-stream',$2,'drawing_3d')`,
      [nativeHash, nativeBytes.byteLength])
    const workerUrl = `postgres://aipdm_test_worker@127.0.0.1:${port}/postgres`
    const result = spawnSync(process.execPath, [
      path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
      'src/app/api/recognition-jobs/recognition-worker.postgres-contract.test.ts',
      '--reporter=dot'
    ], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90_000,
      env: { ...process.env, CI: '1', PDM_DB_PROVIDER: 'postgres',
        PDM_POSTGRES_URL: workerUrl, DEV010_N2_DATABASE_BOUNDARY: 'required',
        PDM_DEV121_WORKER_HTTP_POSTGRES_URL: workerUrl,
        PDM_DATA_DIR:taskRoot,
        PDM_WORKLOAD_AUTH_CREDENTIALS:JSON.stringify({schemaVersion:'ai-pdm.workload-credentials.v1',workloads:[
          {id:'worker-http',token:Buffer.alloc(32,21).toString('base64url'),purposes:['recognition_jobs'],capabilities:['solidworks_document_manager']},
          {id:'worker-other',token:Buffer.alloc(32,22).toString('base64url'),purposes:['recognition_jobs'],capabilities:['solidworks_document_manager']},
          {id:'worker-process',token:Buffer.alloc(32,23).toString('base64url'),purposes:['recognition_jobs','recognition_heartbeat','settings_secret_probe','solidworks_credential'],capabilities:['solidworks_document_manager']}
        ]}),
        PDM_REPOSITORY_DIR: repositoryDir,
        DEV121_NATIVE_FIXTURE_ADAPTER: adapterScript } })
    assert.equal(result.status, 0, `worker HTTP PostgreSQL test failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
    const row = await admin.query(`SELECT status,initiator_principal_id FROM ai_pdm_core.drawing_recognition_sessions
      WHERE id='current-http'`)
    assert.deepEqual(row.rows, [{ status: 'review_ready', initiator_principal_id: 'principal-one' }])
  })
} finally {
  if (workerRuntime) await workerRuntime.close().catch(() => undefined)
  if (runtime) await runtime.close().catch(() => undefined)
  if (admin) await admin.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'],
      { stdio: 'ignore' }); stopped = true } catch { stopped = false }
  } else stopped = true
  if (port) released = await portReleased(port)
  if (stopped && released && fs.realpathSync.native(taskRoot).startsWith(`${tempRoot}${path.sep}`)) {
    fs.rmSync(taskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(taskRoot)
  }
  process.stdout.write(`${JSON.stringify({ runner: 'DEV-121 recognition Principal PostgreSQL',
    migrationSha256: crypto.createHash('sha256').update(migration).digest('hex'),
    workerHttpTestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root,
      'src/app/api/recognition-jobs/recognition-worker.postgres-contract.test.ts'))).digest('hex'),
    checksPassed: checks.length, productionWrites: false,
    cleanup: { stopped, released, tempRemoved },
    retainedTempPath: tempRemoved ? null : taskRoot })}\n`)
}
