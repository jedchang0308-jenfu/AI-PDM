#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
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
let contentServer
let contentPort
let closeRuntimeClient
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
      storage_key text, original_path text, storage_provider text, file_name text,
      file_ext text, mime_type text, file_size integer, content_hash text, hash_algorithm text
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
    const empty = await completePreviewJobAsync(workerOne, {
      jobId: 'job-one', workerId: holder, status: 'succeeded',
      sourceContentHash: 'a'.repeat(64), derivatives: []
    })
    assert.deepEqual(empty, { accepted: false, derivativeIds: [] })
    assert.equal((await admin.query("SELECT status FROM ai_pdm_core.preview_jobs WHERE id='job-one'")).rows[0].status,'running')
    const accepted = await completePreviewJobAsync(workerOne, {
      jobId: 'job-one', workerId: holder, status: 'succeeded',
      sourceContentHash: 'a'.repeat(64), derivatives: [{
        kind:'thumbnail_png',fileName:'preview.png',mimeType:'image/png',
        contentBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fOQAAAAASUVORK5CYII=',
        width:1,height:1,generatorProfile:'fake_preview_worker'
      }]
    })
    assert.equal(accepted.accepted,true)
    assert.equal(accepted.derivativeIds.length,1)
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
  await check('separate preview worker consumes holder-only source HTTP and completes with Principal provenance', async () => {
    const sourceBytes = Buffer.from('synthetic-cad-source-not-native-extraction');
    const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
    fs.mkdirSync(path.join(repositoryRoot,'source'),{recursive:true});
    fs.writeFileSync(path.join(repositoryRoot,'source','one'),sourceBytes);
    await admin.query(`UPDATE ai_pdm_core.file_assets SET storage_provider='local_repository',
      file_name='fixture.slddrw',file_ext='slddrw',mime_type='application/octet-stream',
      file_size=$1,content_hash=$2,hash_algorithm='SHA-256' WHERE id='asset-one'`,[sourceBytes.length,sourceDigest]);
    await admin.query(`INSERT INTO ai_pdm_core.preview_jobs
      (id,company_id,source_file_asset_id,source_content_hash,requested_kind,
       source_extension,status,idempotency_key,generator_profile,created_by,
       created_at,updated_at,metadata_json)
      VALUES ('job-http','company-one','asset-one',$1,
       'native_thumbnail_png','slddrw','queued','job-http-key','synthetic_http_worker',
       'profile-one',now(),now(),
       '{"initiator":{"kind":"verified_principal","principalId":"principal-one"}}')`,[sourceDigest]);
    process.env.PDM_DB_PROVIDER='postgres';
    process.env.PDM_POSTGRES_URL=connectionString;
    process.env.PDM_POSTGRES_MAX_CONNECTIONS='2';
    process.env.DEV010_N2_DATABASE_BOUNDARY='required';
    process.env.PDM_PREVIEW_WORKER_TOKEN='synthetic-task-owned-preview-token';
    const [{POST:claimHandler},{GET:contentHandler},{POST:completeHandler},dbModule] = await Promise.all([
      import('../src/app/api/preview-jobs/claim/route.ts'),
      import('../src/app/api/preview-jobs/[jobId]/content/route.ts'),
      import('../src/app/api/preview-jobs/[jobId]/complete/route.ts'),
      import('../src/lib/db-async-provider.ts')
    ]);
    closeRuntimeClient=dbModule.closeAsyncDatabaseClient;
    contentServer=http.createServer(async (incoming,outgoing)=>{
      try {
        const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
        const url=`http://127.0.0.1:${contentPort}${incoming.url}`;
        const body=Buffer.concat(chunks);
        const request=new Request(url,{method:incoming.method,headers:incoming.headers,
          ...(body.length?{body:new Uint8Array(body)}:{})});
        const route=new URL(url).pathname;
        let response;
        if(route==='/api/preview-jobs/claim' && request.method==='POST') response=await claimHandler(request);
        else if(route==='/api/preview-jobs/job-http/content' && request.method==='GET') response=await contentHandler(request,{params:Promise.resolve({jobId:'job-http'})});
        else if(route==='/api/preview-jobs/job-http/complete' && request.method==='POST') response=await completeHandler(request,{params:Promise.resolve({jobId:'job-http'})});
        else response=new Response(null,{status:404});
        outgoing.writeHead(response.status,Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {outgoing.writeHead(500);outgoing.end('HTTP bridge failure');}
    });
    await new Promise((resolve,reject)=>{contentServer.once('error',reject);contentServer.listen(0,'127.0.0.1',resolve)});
    contentPort=contentServer.address().port;
    process.stdout.write(`${JSON.stringify({runtimeDeclaration:{project:root,purpose:'actual preview HTTP handlers and independent worker source transport',port:contentPort,
      owningProcessTree:'qc-dev-121-preview-worker-postgres -> isolated HTTP bridge -> task-owned worker child',cleanupCondition:'child exits, HTTP closes, pools/cluster close, both ports released',mutationScope:taskRoot,productionWrites:false}})}\n`);
    const workerSource=`
      import assert from 'node:assert/strict';
      import fs from 'node:fs/promises';
      import path from 'node:path';
      import {materializeClaimedPreviewSource} from ${JSON.stringify(new URL('./lib/preview-worker-source.mjs',import.meta.url).href)};
      const baseUrl=process.env.R30_PREVIEW_BASE;
      const token=process.env.PDM_PREVIEW_WORKER_TOKEN;
      const headers={'content-type':'application/json','x-pdm-preview-worker-token':token};
      let response=await fetch(baseUrl+'/api/preview-jobs/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workerId:'http-worker'})});
      assert.equal(response.status,403);
      response=await fetch(baseUrl+'/api/preview-jobs/claim',{method:'POST',headers,body:JSON.stringify({workerId:'http-worker',supportedKinds:['native_thumbnail_png'],supportedExtensions:['slddrw']})});
      assert.equal(response.status,200);const claim=(await response.json()).job;assert.equal(claim.jobId,'job-http');
      await assert.rejects(materializeClaimedPreviewSource({baseUrl,token,workerId:'other-worker',claim}),/READ_FAILED:403/);
      const source=await materializeClaimedPreviewSource({baseUrl,token,workerId:'http-worker',claim});
      const temporary=path.dirname(source.sourcePath);
      try {assert.equal((await fs.readFile(source.sourcePath)).toString(),'synthetic-cad-source-not-native-extraction');}
      finally {await source.cleanup();}
      await assert.rejects(fs.stat(temporary),{code:'ENOENT'});
      const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fOQAAAAASUVORK5CYII=';
      const completion={workerId:'http-worker',status:'succeeded',sourceContentHash:claim.sourceContentHash,derivatives:[{kind:'thumbnail_png',fileName:'preview.png',mimeType:'image/png',contentBase64:png,width:1,height:1,generatorProfile:'synthetic_http_worker'}]};
      response=await fetch(baseUrl+'/api/preview-jobs/job-http/complete',{method:'POST',headers,body:JSON.stringify(completion)});assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);
      response=await fetch(baseUrl+'/api/preview-jobs/job-http/complete',{method:'POST',headers,body:JSON.stringify(completion)});assert.equal(response.status,409);
      response=await fetch(baseUrl+'/api/preview-jobs/job-http/content',{headers:{...headers,'x-pdm-preview-worker-id':'http-worker'}});assert.equal(response.status,403);
      console.log(JSON.stringify({worker:'independent-node',sourceTransport:'actual HTTP',cleanup:true,nativeCadExtraction:false}));
    `;
    const workerResult=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--input-type=module','-e',workerSource],{cwd:root,windowsHide:true,
        env:{...process.env,R30_PREVIEW_BASE:`http://127.0.0.1:${contentPort}`},stdio:['ignore','pipe','pipe']});
      let stdout='';let stderr='';
      child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
      child.once('error',reject);child.once('exit',code=>resolve({code,stdout,stderr}));
    });
    assert.equal(workerResult.code,0,workerResult.stderr);process.stdout.write(workerResult.stdout);
    const job=(await admin.query("SELECT status,metadata_json FROM ai_pdm_core.preview_jobs WHERE id='job-http'")).rows[0];
    assert.equal(job.status,'succeeded');assert.equal(JSON.parse(job.metadata_json).initiator.principalId,'principal-one');
    const derivatives=(await admin.query("SELECT * FROM ai_pdm_core.file_derivatives WHERE preview_job_id='job-http'")).rows;
    assert.equal(derivatives.length,1);assert.equal(derivatives[0].company_id,'company-one');assert.equal(derivatives[0].created_by_worker,'http-worker');
    const output=fs.readFileSync(derivatives[0].original_path);
    assert.equal(crypto.createHash('sha256').update(output).digest('hex'),derivatives[0].content_hash);
  });
} finally {
  if (contentServer) await new Promise(resolve=>contentServer.close(resolve));
  if (closeRuntimeClient) await closeRuntimeClient().catch(()=>undefined);
  if (workerOne) await workerOne.close().catch(() => undefined)
  if (workerTwo) await workerTwo.close().catch(() => undefined)
  if (admin) await admin.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'],
      { stdio: 'ignore' }); stopped = true } catch { stopped = false }
  } else stopped = true
  if (port) released = await portReleased(port);
  if (contentPort) released = released && await portReleased(contentPort);
  if (stopped && released) {
    fs.rmSync(taskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(taskRoot)
  }
  process.stdout.write(`${JSON.stringify({ runner: 'DEV-121 preview worker PostgreSQL',
    checks, productionWrites: false, cleanup: { stopped, released, tempRemoved },
    retainedTempPath: tempRemoved ? null : taskRoot })}\n`)
}
