import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildDev117MigrationBundle, buildDev117MigrationPackage, verifyDev117MigrationBytes } from './lib/dev117-ai-pdm-continuous-release.mjs'

const root=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url)))
let require=createRequire(import.meta.url)
if(!fs.existsSync(path.join(root,'node_modules','pg'))) {
  const dependencyRoot=fs.realpathSync(process.env.PDM_QC_DEPENDENCY_ROOT||root)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dependencyRoot,'package.json'))).name,'ai-pdm')
  require=createRequire(path.join(dependencyRoot,'package.json'))
}
const pg=require('pg'), targetId='fixture-unlinked-profile-001', targetCompany='fixture-company-target'
const operationId='00000000-0000-4000-8000-000000000001'
const operationContext={sourceRevision:'a'.repeat(40),inputSha256:'b'.repeat(64)}
const migrationPath='db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql'
const sourceSql=fs.readFileSync(path.join(root,migrationPath),'utf8')
const sha=value=>crypto.createHash('sha256').update(value).digest('hex')
const auditId='dev121-unlinked-profile-cleanup-v2-'+sha('["fixture-company-target", "fixture-unlinked-profile-001"]')
const profile=JSON.parse(fs.readFileSync(path.join(root,'config/release/dev117-ai-pdm-independent-production-v3.json')))
const n1c=JSON.parse(fs.readFileSync(path.join(root,'config/platform/dev-010-n1c-ai-pdm.json')))
const packageValue=buildDev117MigrationPackage(profile,n1c)
const migrationEntry=packageValue.entries.find(entry=>entry.sourcePath===migrationPath)
assert.ok(migrationEntry,'generic migration must be in the native owner package')
const migration=migrationEntry.sql
const taskRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'aipdm-dev121-unlinked-cleanup-'))
const cluster=path.join(taskRoot,'cluster'), bin=path.resolve(process.env.PDM_POSTGRES_BIN||'C:\\Program Files\\PostgreSQL\\18\\bin')
const output=path.join(root,'output','qa','dev-121','unlinked-profile-cleanup-'+crypto.randomUUID()+'.json')
process.env.PDM_DATA_DIR=path.join(taskRoot,'isolated-data')
process.env.PDM_REPOSITORY_DIR=path.join(taskRoot,'isolated-repository')
const report={schemaVersion:'ai-pdm.dev121.generic-unlinked-profile-cleanup-qc.v2',status:'RUNNING',
  project:root,environment:'LOCAL_SYNTHETIC_DISPOSABLE_POSTGRESQL',productionWrites:false,cases:[],
  sourceHashes:Object.fromEntries([migrationPath,'db/postgres/001_initial_schema.sql',
    'db/postgres/065_dev121_principal_security_subject.sql','db/postgres/083_dev121_authorized_first_login_account.sql',
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'scripts/lib/dev012-production-migration-runner.mjs','scripts/lib/dev117-ai-pdm-continuous-release.mjs',
    'scripts/qc-dev-121-unlinked-profile-cleanup-postgres.mjs'].map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])),
  limitations:['No Production mutation/provider proof; local PostgreSQL SQL/transaction and native packaging only',
    'Unchanged native 065 plus qualified native 001 users/audit DDL on synthetic supporting fixtures; not full production schema',
    'Synthetic admin fixtures do not prove production ACL; runner exact target guard remains unchanged',
    'Owner advisory lane/table locks cover cooperating DDL/writes; privileged out-of-lane DDL is outside authorized scope',
    'Primary SQLite metadata only; actual schema/identity/FK invariants not applicable or independently verified',
    'Parameterized cleanup is migrator-only; the protected runner independently validates private target authorization and immutable context']}
let port,admin,started=false,postgresPid,governorAttempted=false
const governorKeys=['PDM_QC_GOVERNOR_SCRIPT','PDM_QC_GOVERNOR_PYTHON','PDM_QC_GOVERNOR_SESSION','PDM_QC_GOVERNOR_HOST']
const governorEnabled=governorKeys.some(key=>Boolean(process.env[key]))
if(governorEnabled){
  for(const key of governorKeys)assert.ok(process.env[key],key+' is required when governor lifecycle is enabled')
  assert.ok(path.isAbsolute(process.env.PDM_QC_GOVERNOR_SCRIPT));assert.ok(path.isAbsolute(process.env.PDM_QC_GOVERNOR_PYTHON))
  assert.equal(path.basename(fs.realpathSync(process.env.PDM_QC_GOVERNOR_SCRIPT)),'resource_governor.py')
  assert.ok(['codex','antigravity','other'].includes(process.env.PDM_QC_GOVERNOR_HOST))
}
function governor(action){
  const fingerprint=report.runtime.postgres
  assert.ok(fingerprint.StartToken)
  const args=[fs.realpathSync(process.env.PDM_QC_GOVERNOR_SCRIPT),'--agent-host',process.env.PDM_QC_GOVERNOR_HOST,
    '--format','json','session','runtime',action,'--session',process.env.PDM_QC_GOVERNOR_SESSION,
    '--pid',String(postgresPid),'--start-token',fingerprint.StartToken]
  if(action==='register')args.push('--executable',fingerprint.ExecutablePath,'--purpose',report.runtime.purpose,
    '--cleanup-condition',report.runtime.cleanupCondition,'--parent-pid',String(fingerprint.ParentProcessId),'--port',String(port))
  else args.push('--reason','stopped')
  const result=spawnSync(fs.realpathSync(process.env.PDM_QC_GOVERNOR_PYTHON),args,
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024})
  if(result.status!==0)throw new Error('QC_GOVERNOR_'+action.toUpperCase()+'_FAILED')
  return JSON.parse(result.stdout)
}
const clients=new Set()
function native(name,args,extra={}) {
  const r=spawnSync(path.join(bin,name),args,{cwd:root,encoding:'utf8',windowsHide:true,...extra})
  if(r.status!==0)throw new Error(name+' failed: '+(r.stderr||r.stdout))
}
async function freePort(){return await new Promise((resolve,reject)=>{
  const s=net.createServer();s.unref();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{
    const p=s.address().port;s.close(e=>e?reject(e):resolve(p))})
})}
async function released(){return await new Promise(resolve=>{
  const s=net.createConnection({host:'127.0.0.1',port});s.setTimeout(750)
  s.once('connect',()=>{s.destroy();resolve(false)});s.once('timeout',()=>{s.destroy();resolve(true)})
  s.once('error',()=>resolve(true))
})}
function primaryMetadata(){
  const canonical=process.env.PDM_QC_DEPENDENCY_ROOT?fs.realpathSync(process.env.PDM_QC_DEPENDENCY_ROOT):root
  return [root,canonical].filter((r,i,a)=>a.indexOf(r)===i).flatMap(r=>{
    const db=path.join(r,'data','ai-pdm.sqlite')
    return [db,db+'-wal',db+'-shm',db+'.init.lock'].map(file=>{
      if(!fs.existsSync(file))return {path:file,status:'ABSENT'}
      const s=fs.statSync(file);return {path:file,status:'PRESENT',size:s.size,mtimeMs:s.mtimeMs}
    })
  })
}
function processFingerprint(pid){
  const r=spawnSync('powershell.exe',['-NoProfile','-Command',
    'Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+'" | Select-Object ProcessId,ParentProcessId,Name,CreationDate,ExecutablePath,CommandLine,@{Name="StartToken";Expression={(Get-Process -Id $_.ProcessId).StartTime.ToFileTimeUtc().ToString()}} | ConvertTo-Json -Compress'],
    {encoding:'utf8',windowsHide:true})
  if(r.status!==0)throw new Error('PROCESS_FINGERPRINT_FAILED')
  return r.stdout.trim()?JSON.parse(r.stdout):null
}
async function connect(database){
  const c=new pg.Client({host:'127.0.0.1',port,user:'postgres',database,application_name:'dev121-unlinked-synthetic-qc'})
  await c.connect();await c.query('SET timezone TO UTC');clients.add(c);return c
}
async function state(c){
  await c.query('SET timezone TO UTC')
  const tables=(await c.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ai_pdm_core' AND c.relkind='r' ORDER BY c.relname")).rows
  const result={}
  for(const {relname}of tables){
    assert.match(relname,/^[a-z_0-9]+$/)
    const rows=(await c.query('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),\'[]\'::jsonb)::text AS rows FROM ai_pdm_core."'+relname+'" r')).rows[0].rows
    result[relname]=sha(rows)
  }
  return result
}
async function snapshotGuard(c){return (await c.query(
  "SELECT (to_regprocedure('ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()') IS NOT NULL) AS function,(to_regprocedure('ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb)') IS NOT NULL) AS capability,(SELECT count(*)::int FROM pg_trigger WHERE tgrelid='ai_pdm_core.audit_logs'::regclass AND tgname='guard_dev121_unlinked_profile_snapshot_v2') AS trigger"
)).rows[0]}

async function counts(c){return (await c.query("SELECT (SELECT count(*)::int FROM ai_pdm_core.users WHERE id=$1) AS profile,(SELECT count(*)::int FROM ai_pdm_core.audit_logs WHERE id=$2) AS audit,(SELECT count(*)::int FROM ai_pdm_core.schema_migrations WHERE version='ai-pdm-084') AS ledger",[targetId,auditId])).rows[0]}
// Installation, parameterized operation and ledger share the native transaction.
// Subsequent calls check the existing native receipt in a fresh short transaction.
async function install(c){
  await c.query('BEGIN')
  try{await c.query(migration);await c.query('COMMIT')}
  catch(error){await c.query('ROLLBACK');throw error}
}
async function apply(c,{isolation='READ COMMITTED',ledger=true,role='jenfu_ai_pdm_migrator',
  target=targetId,company=targetCompany,operation=operationId,context=operationContext}={}){
  await c.query('BEGIN ISOLATION LEVEL '+isolation)
  try{
    await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='30s'")
    const present=(await c.query("SELECT to_regprocedure('ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb)') IS NOT NULL AS present")).rows[0].present
    if(!present)await c.query(migration)
    assert.ok(['jenfu_ai_pdm_migrator','jenfu_ai_pdm_runtime','postgres'].includes(role))
    await c.query('SET LOCAL ROLE '+role)
    const result=(await c.query('SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1($1,$2,$3,$4::jsonb) AS result',
      [target,company,operation,JSON.stringify(context)])).rows[0].result
    assert.deepEqual(Object.keys(result).sort(),['auditId','priorRowSha256','status'])
    assert.ok(['DELETED','REPLAYED','ABSENT'].includes(result.status))
    if(ledger)await c.query("INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES ('ai-pdm-084','dev121_unlinked_legacy_profile_cleanup',$1,$2)",[sha(migration),operationContext.sourceRevision])
    await c.query('COMMIT');return result
  }catch(e){await c.query('ROLLBACK');throw e}
}
async function caseDb(name){
  const db='qc_'+name.replaceAll('-','_')
  await admin.query('CREATE DATABASE "'+db+'" TEMPLATE qc_baseline')
  return await connect(db)
}
async function check(name,action){
  report.activeCase=name;const detail=await action();delete report.activeCase;report.cases.push({name,status:'PASS',detail});process.stdout.write('PASS '+name+'\n')
}
async function deniedCase(name,setup,code,message,options={}){
  await check(name,async()=>{
    const c=await caseDb(name);await setup(c);const before=await state(c),guardBefore=await snapshotGuard(c);let failure
    try{await apply(c,options)}catch(e){failure=e}
    assert.ok(failure,'expected refusal');assert.equal(failure.code,code);assert.match(failure.message,message)
    assert.deepEqual(await state(c),before);assert.deepEqual(await snapshotGuard(c),guardBefore)
    return {sqlstate:failure.code,error:failure.message,detail:failure.detail||null,counts:await counts(c),snapshotGuard:await snapshotGuard(c),allOwnRowsUnchanged:true}
  })
}
try{
  report.primaryBefore=primaryMetadata();port=await freePort()
  report.runtime={project:root,purpose:process.argv.includes('--focused-cleanup')?'DEV-121 runtime cleanup fault QC':'DEV-121 generic unlinked profile cleanup/rollback QC',port,nodePid:process.pid,
    owningProcessTree:'this QC Node -> task-owned PostgreSQL cluster',taskRoot,
    PDM_DATA_DIR:process.env.PDM_DATA_DIR,PDM_REPOSITORY_DIR:process.env.PDM_REPOSITORY_DIR,
    cleanupCondition:'close own clients; verified own cluster stop; port/process absent; temporary path removed'}
  process.stdout.write(JSON.stringify({runtimeDeclaration:report.runtime})+'\n')
  native('initdb.exe',['-D',cluster,'--auth-local=trust','--auth-host=trust','--username=postgres','--encoding=UTF8','--no-locale'])
  native('pg_ctl.exe',['-D',cluster,'-l',path.join(taskRoot,'postgres.log'),'-o','-p '+port+' -h 127.0.0.1','-w','start'],{stdio:'ignore'})
  started=true;postgresPid=Number(fs.readFileSync(path.join(cluster,'postmaster.pid'),'utf8').split(/\r?\n/)[0])
  report.runtime.postgres=processFingerprint(postgresPid)
  assert.equal(report.runtime.postgres.ProcessId,postgresPid);assert.ok(report.runtime.postgres.CreationDate)
  assert.equal(fs.realpathSync(report.runtime.postgres.ExecutablePath),fs.realpathSync(path.join(bin,'postgres.exe')))
  const clusterArg=report.runtime.postgres.CommandLine.match(/ -D "([^"]+)"/)?.[1]
  assert.ok(clusterArg);report.runtime.resolvedCluster=fs.realpathSync(clusterArg);assert.equal(report.runtime.resolvedCluster,fs.realpathSync(cluster))
  if(governorEnabled){
    governorAttempted=true;const receipt=governor('register')
    report.runtime.resourceGovernor={session:process.env.PDM_QC_GOVERNOR_SESSION,registered:true,receipt}
  }
  admin=await connect('postgres');report.engine=(await admin.query("SELECT current_setting('server_version') AS version,current_setting('server_version_num')::int AS versionNumber,current_setting('server_version_num')::int / 10000 AS major")).rows[0];if(process.argv.includes('--focused-cleanup')) {
    assert.equal((await admin.query('SELECT 1::int AS value')).rows[0].value,1)
    report.fixtureMutationLedger=['Task-owned cluster only; no application schema/profile fixtures in cleanup-only mode']
  }else{
  await admin.query('CREATE DATABASE qc_baseline');const baseline=await connect('qc_baseline')
  const oldHarness=fs.readFileSync(path.join(root,'scripts/qc-dev-121-principal-schema-postgres.mjs'),'utf8').replaceAll('\r\n','\n')
  let fixture=oldHarness.match(/await client\.query\(\x60(\s+CREATE ROLE jenfu_ai_pdm_migrator[\s\S]*?)\x60\)/)?.[1]
  assert.ok(fixture,'synthetic native-065 supporting fixture found')
  const initial=fs.readFileSync(path.join(root,'db/postgres/001_initial_schema.sql'),'utf8')
  const nativeUsers=initial.match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\n\);/)?.[0]
    .replace('CREATE TABLE IF NOT EXISTS users','CREATE TABLE ai_pdm_core.users')
    .replaceAll('REFERENCES companies(','REFERENCES ai_pdm_core.companies(').replaceAll('REFERENCES users(','REFERENCES ai_pdm_core.users(')
  assert.ok(nativeUsers)
  fixture=fixture.replace(/CREATE TABLE ai_pdm_core\.users \([\s\S]*?\n    \);/,nativeUsers)
    .replace("INSERT INTO ai_pdm_core.users (id,company_id)\n      VALUES ('pdm-user-one','company-one'),('pdm-user-two','company-one');",
      "INSERT INTO ai_pdm_core.users (id,company_id,display_name,role) VALUES ('pdm-user-one','company-one','Synthetic one','Engineer'),('pdm-user-two','company-one','Synthetic two','Engineer');")
  assert.ok(fixture.includes('Synthetic one'));await baseline.query(fixture)
  await baseline.query("INSERT INTO ai_pdm_core.companies VALUES ('fixture-company-target','FIXTURE','business','Synthetic target company')")
  await baseline.query(fs.readFileSync(path.join(root,'db/postgres/065_dev121_principal_security_subject.sql'),'utf8'))
  await baseline.query('RESET ROLE')
  const nativeAudit=initial.match(/CREATE TABLE IF NOT EXISTS audit_logs \([\s\S]*?\n\);/)?.[0]
    .replace('CREATE TABLE IF NOT EXISTS audit_logs','CREATE TABLE ai_pdm_core.audit_logs')
    .replaceAll('REFERENCES companies(','REFERENCES ai_pdm_core.companies(').replaceAll('REFERENCES submissions(','REFERENCES ai_pdm_core.submissions(')
  await baseline.query('CREATE TABLE ai_pdm_core.submissions (id text PRIMARY KEY); ALTER TABLE ai_pdm_core.submissions OWNER TO jenfu_ai_pdm_migrator;')
  await baseline.query(nativeAudit)
  await baseline.query("ALTER TABLE ai_pdm_core.audit_logs OWNER TO jenfu_ai_pdm_migrator; CREATE TABLE ai_pdm_core.schema_migrations(version text PRIMARY KEY,name text NOT NULL,checksum_sha256 char(64) NOT NULL,source_revision text NOT NULL,applied_at timestamptz DEFAULT clock_timestamp()); ALTER TABLE ai_pdm_core.schema_migrations OWNER TO jenfu_ai_pdm_migrator;")
  await baseline.query("INSERT INTO ai_pdm_core.users(id,display_name,email,role,company_id,created_at,updated_at) VALUES ($1,'Synthetic authorized target',NULL,'Engineer','fixture-company-target','2026-10-09T00:00:00.123456Z','2026-10-09T00:00:00.654321Z')",[targetId])
  report.fixtureMutationLedger=['Synthetic supporting fixture from existing native 065 QC',
    'Native 001 users/audit DDL qualified to owned core; native 065 unchanged; synthetic submissions and ledger',
    'Per-case template databases and synthetic rows/fault constraints/triggers only']
  await baseline.end();clients.delete(baseline)
  if(!process.argv.includes('--focused-receipt')) {
  await check('native-owner-packaging',async()=>{
    const bytes=new Map(profile.migrations.entries.map(e=>[e.path,fs.readFileSync(path.join(root,e.path))]))
    assert.equal(verifyDev117MigrationBytes(profile,bytes),true)
    const bundle=buildDev117MigrationBundle(profile,packageValue,'a'.repeat(40)),entry=bundle.bundle.entries.at(-1)
    assert.equal(entry.order,34);assert.equal(entry.version,'ai-pdm-084');assert.equal(entry.path,migrationPath)
    assert.equal(entry.sourceSha256,sha(sourceSql));assert.equal(Buffer.from(entry.sqlBase64,'base64').toString('utf8'),migration)
    assert.equal(bundle.bundle.entries.at(-2).sourceSha256,'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9')
    return {entryCount:bundle.bundle.entries.length,path:entry.path,sourceSha256:entry.sourceSha256,appliedSha256:entry.appliedSha256,manifestSha256:bundle.bundle.manifestSha256}
  })
  await check('installation-has-zero-data-effects',async()=>{
    const c=await caseDb('install_only'),before=await state(c)
    await install(c);assert.deepEqual(await state(c),before)
    assert.deepEqual(await snapshotGuard(c),{function:true,capability:true,trigger:1})
    return {allOwnRowsUnchanged:true,capabilityInstalled:true,containsNoTargetDeletion:true}
  })
  await check('unlinked-delete-audit-replay',async()=>{
    const c=await caseDb('success'),before=await state(c)
    const prior=(await c.query('SELECT to_jsonb(u)::text AS row FROM ai_pdm_core.users u WHERE id=$1',[targetId])).rows[0].row
    const result=await apply(c);assert.equal(result.status,'DELETED');assert.equal(result.auditId,auditId);assert.deepEqual(await counts(c),{profile:0,audit:1,ledger:1})
    const receipt=(await c.query("SELECT (detail_json->'priorRow')::text AS row,detail_json->>'priorRowSha256' AS hash FROM ai_pdm_core.audit_logs WHERE id=$1",[auditId])).rows[0]
    assert.equal(receipt.row,prior);assert.equal(receipt.hash,sha(prior));assert.match(receipt.row,/\.123456\+00:00/)
    const after=await state(c)
    for(const t of Object.keys(before).filter(t=>!['users','audit_logs','schema_migrations'].includes(t)))assert.equal(after[t],before[t])
    assert.equal((await c.query("SELECT count(*)::int AS n FROM ai_pdm_core.users WHERE id IN ('pdm-user-one','pdm-user-two')")).rows[0].n,2)
    await c.query("SET timezone='Asia/Taipei'");const replay=await apply(c,{ledger:false});assert.equal(replay.status,'REPLAYED');assert.equal(replay.auditId,result.auditId);assert.equal(replay.priorRowSha256,result.priorRowSha256);assert.deepEqual(await state(c),after)
    return {counts:await counts(c),nativePriorRowHash:receipt.hash,microsecondsPreserved:true,replayNoAdditionalAudit:true,otherTablesUnchanged:true}
  })
  await check('already-absent-noop',async()=>{
    const c=await caseDb('absent');await c.query('DELETE FROM ai_pdm_core.users WHERE id=$1',[targetId])
    await install(c);const before=await state(c);const one=await apply(c,{ledger:false}),two=await apply(c,{ledger:false});assert.equal(one.status,'ABSENT');assert.deepEqual(two,one);assert.equal(one.priorRowSha256,null);assert.deepEqual(await state(c),before)
    return {counts:await counts(c),snapshotGuard:await snapshotGuard(c),allOwnRowsUnchanged:true}
  })
  await check('historical-audit-preserved',async()=>{
    const c=await caseDb('historical')
    await c.query("INSERT INTO ai_pdm_core.audit_logs(id,actor_id,action,detail_json,company_id,scope_kind) VALUES ('historical-trace',$1,'historical.synthetic',jsonb_build_object('oldActor',$1::text),'fixture-company-target','tenant')",[targetId])
    const prior=(await c.query("SELECT to_jsonb(a)::text AS row FROM ai_pdm_core.audit_logs a WHERE id='historical-trace'")).rows[0].row
    await apply(c);assert.equal((await c.query("SELECT to_jsonb(a)::text AS row FROM ai_pdm_core.audit_logs a WHERE id='historical-trace'")).rows[0].row,prior)
    return {counts:await counts(c),historicalAuditByteEquivalent:true}
  })
  await deniedCase('linked-principal',c=>c.query("INSERT INTO ai_pdm_core.principal_accounts(principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,profile_version,system_role_enabled,minimum_assurance) VALUES ('fixture-principal-unrelated',$1,'fixture-company-target','fixture-employee-unrelated','human_personal','active',1,1,true,'aal1')",[targetId]),'23514',/REFERENCED_FK/)
  await deniedCase('linked-cutover',c=>c.query("INSERT INTO ai_pdm_core.principal_identity_cutovers(pdm_user_id,status,source_hash) VALUES ($1,'legacy_compatible',repeat('a',64))",[targetId]),'23514',/REFERENCED_FK/)
  await deniedCase('linked-identity',c=>c.query("INSERT INTO ai_pdm_core.auth_identities(id,user_id) VALUES ('qc-identity',$1)",[targetId]),'23514',/REFERENCED_FK/)
  await deniedCase('linked-session',c=>c.query("INSERT INTO ai_pdm_core.account_session_records(id,user_id) VALUES ('qc-session',$1)",[targetId]),'23514',/REFERENCED_FK/)
  for(const rule of ['CASCADE','SET NULL','RESTRICT','NO ACTION'])await deniedCase('fk-'+rule.toLowerCase().replaceAll(' ','-'),async c=>{
    await c.query('CREATE TABLE ai_pdm_core.qc_child(id text PRIMARY KEY,user_id text REFERENCES ai_pdm_core.users(id) ON DELETE '+rule+'); ALTER TABLE ai_pdm_core.qc_child OWNER TO jenfu_ai_pdm_migrator;')
    await c.query("INSERT INTO ai_pdm_core.qc_child VALUES ('child',$1)",[targetId])
  },'23514',/REFERENCED_FK/)
  await deniedCase('composite-fk',async c=>{
    await c.query('CREATE TABLE ai_pdm_core.qc_child(id text PRIMARY KEY,user_id text,company_id text,FOREIGN KEY(user_id,company_id) REFERENCES ai_pdm_core.users(id,company_id) ON DELETE CASCADE); ALTER TABLE ai_pdm_core.qc_child OWNER TO jenfu_ai_pdm_migrator;')
    await c.query("INSERT INTO ai_pdm_core.qc_child VALUES ('child',$1,'fixture-company-target')",[targetId])
  },'23514',/REFERENCED_FK/)
  for(const [name,type,value]of [
    ['text-reference','text',targetId],['json-value','jsonb',JSON.stringify({nested:[{actor:targetId}]})],
    ['json-key','jsonb',JSON.stringify({[targetId]:'synthetic'})],['nested-json-key','jsonb',JSON.stringify({a:42,b:[null,'early',{deep:{[targetId]:7}}]})],['serialized-json-key','text',JSON.stringify({a:42,b:[false,{[targetId]:'synthetic'}]})],['serialized-json','text',JSON.stringify({nested:{actor:targetId}})],
    ['array-reference','text[]',[targetId]]])await deniedCase(name,async c=>{
      await c.query('CREATE TABLE ai_pdm_core.qc_mention(id text PRIMARY KEY,value '+type+'); ALTER TABLE ai_pdm_core.qc_mention OWNER TO jenfu_ai_pdm_migrator;')
      await c.query("INSERT INTO ai_pdm_core.qc_mention VALUES ('mention',$1)",[value])
    },'23514',/UNCLASSIFIED_EXACT_VALUE/)
  await deniedCase('immutable-operation-mention',c=>c.query("INSERT INTO ai_pdm_core.principal_identity_operations(operation_id,operation_kind,input_hash,cohort_hash,result_json) VALUES ('historical-operation','provision',repeat('a',64),repeat('b',64),jsonb_build_object('profile',$1::text))",[targetId]),'23514',/IMMUTABLE_RECEIPT_REFERENCE/)
  await check('wrong-target-absent-no-effects',async()=>{
    const c=await caseDb('wrong_target');await install(c);const before=await state(c)
    const result=await apply(c,{target:'fixture-no-such-profile',ledger:false})
    assert.equal(result.status,'ABSENT');assert.deepEqual(await state(c),before)
    return {status:result.status,allOwnRowsUnchanged:true}
  })
  for(const [name,options]of [
    ['empty-target',{target:''}],['empty-company',{company:''}],['null-target',{target:null}],
    ['oversized-target',{target:'x'.repeat(513)}],['target-control-character',{target:'fixture\nprofile'}],
    ['company-control-character',{company:'fixture\tcompany'}],['target-whitespace',{target:' fixture'}],
    ['invalid-operation',{operation:'not-a-uuid'}],['uppercase-operation',{operation:'AAAAAAAA-0000-4000-8000-000000000001'}]])
    await deniedCase(name,async()=>{},'23514',/INPUT_INVALID/,{...options,ledger:false})
  for(const [name,context]of [
    ['null-context',null],['array-context',[]],['unknown-context',{...operationContext,extra:'fixture'}],
    ['missing-source-context',{inputSha256:'b'.repeat(64)}],['invalid-source-context',{...operationContext,sourceRevision:'invalid'}],
    ['invalid-input-context',{...operationContext,inputSha256:'0'.repeat(63)}],
    ['nonstring-source-context',{...operationContext,sourceRevision:7}]])
    await deniedCase(name,async()=>{},'23514',/CONTEXT_INVALID/,{context,ledger:false})
  await deniedCase('wrong-company-parameter',async()=>{},'23514',/COMPANY_MISMATCH/,{company:'fixture-wrong-company',ledger:false})
  await deniedCase('runtime-capability-execute-denied',c=>install(c),'42501',/permission denied/,{role:'jenfu_ai_pdm_runtime',ledger:false})
  await deniedCase('superuser-is-not-approved-writer',c=>install(c),'23514',/WRITER_INVALID/,{role:'postgres',ledger:false})
  await deniedCase('capability-runtime-acl-drift',async c=>{
    await install(c);await c.query('GRANT EXECUTE ON FUNCTION ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb) TO jenfu_ai_pdm_runtime')
  },'23514',/CAPABILITY_DRIFT/,{ledger:false})
  await deniedCase('capability-public-acl-drift',async c=>{
    await install(c);await c.query('GRANT EXECUTE ON FUNCTION ai_pdm_core.delete_unlinked_legacy_profile_v1(text,text,text,jsonb) TO PUBLIC')
  },'23514',/CAPABILITY_DRIFT/,{ledger:false})
  await deniedCase('wrong-company',c=>c.query("UPDATE ai_pdm_core.users SET company_id='company-one' WHERE id=$1",[targetId]),'23514',/COMPANY_MISMATCH/)
  await deniedCase('credential-present',c=>c.query("UPDATE ai_pdm_core.users SET password_hash='synthetic-noncredential-sentinel' WHERE id=$1",[targetId]),'23514',/CREDENTIAL_PRESENT/)
  await deniedCase('unknown-profile-column',c=>c.query('ALTER TABLE ai_pdm_core.users ADD COLUMN unknown_credential text'),'23514',/PROFILE_SHAPE_UNKNOWN/)
  await deniedCase('disabled-legacy-guard',c=>c.query('ALTER TABLE ai_pdm_core.users DISABLE TRIGGER guard_legacy_user_security_write_v1'),'23514',/LEGACY_GUARD_DRIFT/)
  await deniedCase('forced-rls',c=>c.query('ALTER TABLE ai_pdm_core.users ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_pdm_core.users FORCE ROW LEVEL SECURITY'),'23514',/OWNERSHIP_OR_RLS/)
  await deniedCase('unsupported-isolation',async()=>{},'23514',/WRITER_INVALID/,{isolation:'SERIALIZABLE'})
  await deniedCase('cross-schema-edge',c=>c.query('CREATE SCHEMA qc_external_boundary; CREATE TABLE qc_external_boundary.child(id text REFERENCES ai_pdm_core.users(id));'),'23514',/FK_BOUNDARY_UNKNOWN/)
  await deniedCase('unvalidated-edge',c=>c.query('CREATE TABLE ai_pdm_core.qc_child(id text); ALTER TABLE ai_pdm_core.qc_child OWNER TO jenfu_ai_pdm_migrator; ALTER TABLE ai_pdm_core.qc_child ADD CONSTRAINT qc_not_valid FOREIGN KEY(id) REFERENCES ai_pdm_core.users(id) NOT VALID'),'23514',/FK_BOUNDARY_UNKNOWN/)
  await deniedCase('late-audit-failure',c=>c.query("CREATE FUNCTION ai_pdm_core.qc_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF EXISTS (SELECT 1 FROM ai_pdm_core.users WHERE id='fixture-unlinked-profile-001') THEN RAISE EXCEPTION 'QC_EARLY_FAIL'; END IF; RAISE EXCEPTION 'QC_AFTER_PROFILE_DELETE' USING ERRCODE='P0001'; END $f$; CREATE TRIGGER qc_fail_audit BEFORE INSERT ON ai_pdm_core.audit_logs FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.qc_fail_audit();"),'P0001',/QC_AFTER_PROFILE_DELETE/)
  await deniedCase('late-ledger-failure',c=>c.query("CREATE FUNCTION ai_pdm_core.qc_fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $f$ DECLARE p integer; a integer; BEGIN SELECT count(*) INTO p FROM ai_pdm_core.users WHERE id='fixture-unlinked-profile-001'; SELECT count(*) INTO a FROM ai_pdm_core.audit_logs WHERE action='legacy_profile.unlinked.delete.v2'; IF p<>0 OR a<>1 THEN RAISE EXCEPTION 'QC_EARLY_FAIL'; END IF; RAISE EXCEPTION 'QC_AFTER_PROFILE_DELETE_AND_AUDIT' USING ERRCODE='P0001',DETAIL=format('profile=%s audit=%s',p,a); END $f$; CREATE TRIGGER qc_fail_ledger BEFORE INSERT ON ai_pdm_core.schema_migrations FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.qc_fail_ledger();"),'P0001',/QC_AFTER_PROFILE_DELETE_AND_AUDIT/)
  await deniedCase('bounded-lock-failure',async c=>{
    const database=(await c.query('SELECT current_database() AS db')).rows[0].db
    const holder=await connect(database);await holder.query('BEGIN');await holder.query('LOCK TABLE ai_pdm_core.users IN SHARE ROW EXCLUSIVE MODE')
  },'55P03',/lock timeout/)
  await check('parallel-cleanup-native-lock-replay',async()=>{
    const first=await caseDb('parallel'),second=await connect('qc_parallel'),holder=await connect('qc_parallel')
    await install(first)
    const before=await state(first)
    await first.query("CREATE FUNCTION ai_pdm_core.qc_pause_audit() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN PERFORM pg_advisory_xact_lock(121,84); RETURN NEW; END $f$; CREATE TRIGGER qc_pause_audit BEFORE INSERT ON ai_pdm_core.audit_logs FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.qc_pause_audit();")
    await holder.query('SELECT pg_advisory_lock(121,84)')
    const p1=(await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const p2=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const waitPending=async pid=>{
      const deadline=Date.now()+1000
      while(Date.now()<deadline){
        const row=(await holder.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted",[pid])).rows[0]
        if(row.n>0)return
        await new Promise(resolve=>setTimeout(resolve,20))
      }
      throw new Error('QC_BARRIER_OVERLAP_TIMEOUT')
    }
    let one,two
    try{
      one=apply(first,{ledger:false});one.catch(()=>undefined);await waitPending(p1)
      two=apply(second,{ledger:false});two.catch(()=>undefined);await waitPending(p2)
    }finally{await holder.query('SELECT pg_advisory_unlock(121,84)')}
    const outcomes=await Promise.all([one,two]);assert.deepEqual(outcomes.map(x=>x.status).sort(),['DELETED','REPLAYED'])
    assert.deepEqual(await counts(first),{profile:0,audit:1,ledger:0})
    const after=await state(first)
    for(const t of Object.keys(before).filter(t=>!['users','audit_logs'].includes(t)))assert.equal(after[t],before[t])
    return {bothCallersSucceeded:true,overlapProvenByTwoUngrantedAdvisoryLocks:true,
      backendPids:[p1,p2],counts:await counts(first),otherOwnTablesUnchanged:true,
      scope:'native parameterized SQL concurrency; not actual production runner execution'}
  })

  }
  await check('snapshot-native-restore',async()=>{
    const c=await caseDb('snapshot_restore'),before=await state(c)
    const original=(await c.query('SELECT to_jsonb(u)::text AS row FROM ai_pdm_core.users u WHERE id=$1',[targetId])).rows[0].row
    await apply(c);const afterDelete=await state(c)
    await c.query("INSERT INTO ai_pdm_core.users SELECT (jsonb_populate_record(NULL::ai_pdm_core.users,detail_json->'priorRow')).* FROM ai_pdm_core.audit_logs WHERE id=$1",[auditId])
    const restored=(await c.query('SELECT to_jsonb(u)::text AS row FROM ai_pdm_core.users u WHERE id=$1',[targetId])).rows[0].row
    assert.equal(restored,original);assert.match(restored,/\.123456\+00:00/);assert.match(restored,/\.654321\+00:00/)
    const afterRestore=await state(c);assert.equal(afterRestore.users,before.users)
    for(const t of Object.keys(afterDelete).filter(t=>t!=='users'))assert.equal(afterRestore[t],afterDelete[t])
    return {nativeRowHash:sha(restored),completeNativeRowByteEquivalent:true,microsecondsPreserved:true,
      otherTablesUnchanged:true,counts:await counts(c),scope:'synthetic restore only; no Production restore/down migration'}
  })
  for(const variant of ['id','action','hash','shape'])await deniedCase('receipt-conflict-'+variant,async c=>{
    await apply(c)
    // Synthetic admin tampering fixture only; product SQL never disables a guard.
    await c.query('ALTER TABLE ai_pdm_core.audit_logs DISABLE TRIGGER guard_dev121_unlinked_profile_snapshot_v2')
    if(variant==='id')await c.query("UPDATE ai_pdm_core.audit_logs SET detail_json=jsonb_set(detail_json,'{targetProfileId}','\"different-synthetic-profile\"'::jsonb) WHERE id=$1",[auditId])
    if(variant==='action')await c.query("UPDATE ai_pdm_core.audit_logs SET action='different.synthetic.action' WHERE id=$1",[auditId])
    if(variant==='hash')await c.query("UPDATE ai_pdm_core.audit_logs SET detail_json=jsonb_set(detail_json,'{priorRowSha256}',to_jsonb(repeat('0',64))) WHERE id=$1",[auditId])
    if(variant==='shape')await c.query("UPDATE ai_pdm_core.audit_logs SET detail_json=jsonb_set(jsonb_set(detail_json,'{priorRow}',(detail_json->'priorRow')-'display_name'),'{priorRowSha256}',to_jsonb(encode(sha256(convert_to(((detail_json->'priorRow')-'display_name')::text,'UTF8')),'hex'))) WHERE id=$1",[auditId])
    await c.query('ALTER TABLE ai_pdm_core.audit_logs ENABLE TRIGGER guard_dev121_unlinked_profile_snapshot_v2')
  },'23514',/RECEIPT_CONFLICT/,{ledger:false})
  await deniedCase('replay-company-mismatch',c=>apply(c),'23514',/RECEIPT_CONFLICT/,
    {company:'fixture-wrong-company',ledger:false})
  await deniedCase('replay-operation-mismatch',c=>apply(c),'23514',/RECEIPT_CONFLICT/,
    {operation:'00000000-0000-4000-8000-000000000002',ledger:false})
  await deniedCase('replay-source-mismatch',c=>apply(c),'23514',/RECEIPT_CONFLICT/,
    {context:{...operationContext,sourceRevision:'c'.repeat(40)},ledger:false})
  await deniedCase('replay-private-input-mismatch',c=>apply(c),'23514',/RECEIPT_CONFLICT/,
    {context:{...operationContext,inputSha256:'d'.repeat(64)},ledger:false})
  await deniedCase('restored-target-replay-denied',async c=>{
    await apply(c)
    await c.query("INSERT INTO ai_pdm_core.users SELECT (jsonb_populate_record(NULL::ai_pdm_core.users,detail_json->'priorRow')).* FROM ai_pdm_core.audit_logs WHERE id=$1",[auditId])
  },'23514',/RECEIPT_CONFLICT/,{ledger:false})

  await check('runtime-snapshot-update-delete-fenced',async()=>{
    const c=await caseDb('runtime_guard');await apply(c)
    await c.query('GRANT SELECT,UPDATE,DELETE ON ai_pdm_core.audit_logs TO jenfu_ai_pdm_runtime')
    const before=await state(c),failures=[]
    for(const query of [
      "UPDATE ai_pdm_core.audit_logs SET id='replacement-id' WHERE id=$1",
      "UPDATE ai_pdm_core.audit_logs SET detail_json=jsonb_set(detail_json,'{priorRowSha256}',to_jsonb(repeat('0',64))) WHERE id=$1",
      "DELETE FROM ai_pdm_core.audit_logs WHERE id=$1"]){
      await c.query('BEGIN');await c.query('SET LOCAL ROLE jenfu_ai_pdm_runtime');let error
      try{await c.query(query,[auditId])}catch(e){error=e}finally{await c.query('ROLLBACK')}
      assert.equal(error?.code,'23514');assert.match(error.message,/SNAPSHOT_IMMUTABLE/);failures.push(error.message)
      assert.deepEqual(await state(c),before)
    }
    assert.equal((await c.query("SELECT has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()','EXECUTE') AS can")).rows[0].can,false)
    return {actualRole:'jenfu_ai_pdm_runtime',sqlstate:'23514',attempts:3,allOwnRowsUnchanged:true,
      deniedIdUpdate:true,deniedSnapshotHashUpdate:true,deniedDelete:true,functionExecuteRevoked:true,
      aclScope:'synthetic runtime SELECT/UPDATE/DELETE grant mirrors known baseline; no Production ACL claim'}
  })
  await check('runtime-cannot-forge-capability-snapshot',async()=>{
    const c=await caseDb('runtime_insert');await install(c)
    await c.query('GRANT INSERT ON ai_pdm_core.audit_logs TO jenfu_ai_pdm_runtime')
    const before=await state(c);await c.query('BEGIN');await c.query('SET LOCAL ROLE jenfu_ai_pdm_runtime');let failure
    try{await c.query("INSERT INTO ai_pdm_core.audit_logs(id,action,detail_json) VALUES ('fixture-forged-snapshot','legacy_profile.unlinked.delete.v2',jsonb_build_object('contractVersion','ai-pdm.dev121.unlinked-profile-cleanup.v2'))")}
    catch(error){failure=error}finally{await c.query('ROLLBACK')}
    assert.equal(failure?.code,'23514');assert.match(failure.message,/SNAPSHOT_WRITER_INVALID/)
    assert.deepEqual(await state(c),before);return {runtimeInsertRefused:true,allOwnRowsUnchanged:true}
  })
  await check('other-audit-update-unchanged',async()=>{
    const c=await caseDb('other_audit_update')
    await c.query("INSERT INTO ai_pdm_core.audit_logs(id,action) VALUES ('other-history','historical.synthetic')")
    await apply(c)
    const snapshot=(await c.query('SELECT to_jsonb(a)::text AS row FROM ai_pdm_core.audit_logs a WHERE id=$1',[auditId])).rows[0].row
    await c.query('GRANT SELECT,UPDATE ON ai_pdm_core.audit_logs TO jenfu_ai_pdm_runtime')
    await c.query('BEGIN');await c.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
    try{await c.query("UPDATE ai_pdm_core.audit_logs SET action='historical.changed' WHERE id='other-history'");await c.query('COMMIT')}
    catch(e){await c.query('ROLLBACK');throw e}
    assert.equal((await c.query('SELECT to_jsonb(a)::text AS row FROM ai_pdm_core.audit_logs a WHERE id=$1',[auditId])).rows[0].row,snapshot)
    assert.equal((await c.query("SELECT action FROM ai_pdm_core.audit_logs WHERE id='other-history'")).rows[0].action,'historical.changed')
    return {actualRole:'jenfu_ai_pdm_runtime',otherHistoryUpdateSucceeded:true,recoverySnapshotUnchanged:true}
  })
  await deniedCase('snapshot-guard-missing',async c=>{
    await apply(c);await c.query('DROP TRIGGER guard_dev121_unlinked_profile_snapshot_v2 ON ai_pdm_core.audit_logs; DROP FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2()')
  },'23514',/SNAPSHOT_GUARD_MISSING/,{ledger:false})
  await deniedCase('snapshot-guard-disabled',async c=>{
    await apply(c);await c.query('ALTER TABLE ai_pdm_core.audit_logs DISABLE TRIGGER guard_dev121_unlinked_profile_snapshot_v2')
  },'23514',/SNAPSHOT_GUARD_DRIFT/,{ledger:false})
  await deniedCase('snapshot-guard-body-drift',async c=>{
    await apply(c);await c.query("CREATE OR REPLACE FUNCTION ai_pdm_core.guard_dev121_unlinked_profile_snapshot_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $f$ BEGIN RETURN NEW; END; $f$")
  },'23514',/SNAPSHOT_GUARD_DRIFT/,{ledger:false})

  }
  report.status='PASS'
}catch(error){report.status='FAIL';report.failure={code:error.code||null,message:error.message,where:error.where||null,
  position:error.position||null,internalPosition:error.internalPosition||null,internalQuery:error.internalQuery||null};process.exitCode=1}
finally{
  const errors=[]
  report.cleanup={errors,clusterStopped:!started,portReleased:false,postgresProcessAbsent:false,
    tempRemoved:false,primaryMetadataUnchanged:false,sqliteInitializationCalled:false}
  const step=async(name,action)=>{
    try{await action()}catch(error){errors.push({stage:name,code:error.code||null,message:error.message})}
  }
  const bounded=promise=>Promise.race([promise,new Promise((_,reject)=>{
    const timer=setTimeout(()=>reject(new Error('QC_CLEANUP_CLIENT_TIMEOUT')),3000);timer.unref()
  })])
  for(const c of clients){
    await step('client-rollback',async()=>{await bounded(c.query('ROLLBACK'))})
    await step('client-close',async()=>{await bounded(c.end())})
  }
  const verifyCluster=()=>{
    if(!postgresPid||!report.runtime?.postgres)throw new Error('QC_CLEANUP_NO_INITIAL_FINGERPRINT')
    assert.equal(Number(fs.readFileSync(path.join(cluster,'postmaster.pid'),'utf8').split(/\r?\n/)[0]),postgresPid)
    const current=processFingerprint(postgresPid)
    assert.ok(current,'QC_CLEANUP_PROCESS_NOT_FOUND')
    assert.equal(current.ProcessId,postgresPid)
    assert.equal(current.CreationDate,report.runtime.postgres.CreationDate)
    assert.equal(current.Name.toLowerCase(),'postgres.exe')
    assert.equal(fs.realpathSync(current.ExecutablePath),fs.realpathSync(path.join(bin,'postgres.exe')))
    assert.equal(fs.realpathSync(current.ExecutablePath),fs.realpathSync(report.runtime.postgres.ExecutablePath))
    const data=current.CommandLine.match(/ -D "([^"]+)"/)?.[1]
    assert.ok(data);assert.equal(fs.realpathSync(data),fs.realpathSync(cluster))
    report.cleanup.identityVerified={pid:postgresPid,creationDate:current.CreationDate,
      executable:fs.realpathSync(current.ExecutablePath),dataDirectory:fs.realpathSync(data)}
  }
  const stop=()=>{
    verifyCluster()
    native('pg_ctl.exe',['-D',cluster,'-m','fast','-t','30','-w','stop'],{stdio:'ignore'})
    report.cleanup.clusterStopped=true
  }
  if(started){
    await step('verified-primary-stop',async()=>{
      verifyCluster()
      if(process.argv.includes('--qc-cleanup-reject-stop-once')){
        report.cleanup.faultInjection='SYNTHETIC_PRIMARY_STOP_REFUSED_ONCE'
        throw new Error('QC_SYNTHETIC_STOP_REFUSED')
      }
      stop()
    })
    if(!report.cleanup.clusterStopped){
      await step('verified-recovery-stop',async()=>{stop();report.cleanup.recoveryStopSucceeded=true})
    }
  }
  await step('independent-os-port-check',async()=>{
    if(!port){report.cleanup.portReleased=true;return}
    const check=spawnSync('powershell.exe',['-NoProfile','-Command',
      '$listeners=@(Get-NetTCPConnection -State Listen -LocalPort '+port+' -ErrorAction SilentlyContinue); $listeners.Count'],
      {encoding:'utf8',windowsHide:true})
    if(check.status!==0)throw new Error('QC_CLEANUP_OS_PORT_CHECK_FAILED')
    const count=Number(check.stdout.trim())
    assert.ok(Number.isInteger(count));report.cleanup.osListenerCount=count
    report.cleanup.portReleased=count===0&&await released()
    if(!report.cleanup.portReleased)throw new Error('QC_CLEANUP_PORT_STILL_LISTENING')
  })
  await step('independent-process-check',async()=>{
    const marker=fs.existsSync(path.join(cluster,'postmaster.pid'))
      ? Number(fs.readFileSync(path.join(cluster,'postmaster.pid'),'utf8').split(/\r?\n/)[0]) : null
    const observed=postgresPid||marker
    report.cleanup.postgresProcessAbsent=!observed||!processFingerprint(observed)
    if(!report.cleanup.postgresProcessAbsent)throw new Error('QC_CLEANUP_PROCESS_REMAINS')
  })
  await step('resource-governor-runtime-release',async()=>{
    if(!governorAttempted)return
    if(!report.cleanup.portReleased||!report.cleanup.postgresProcessAbsent||!report.cleanup.clusterStopped)
      throw new Error('QC_GOVERNOR_RELEASE_REQUIRES_NATIVE_STOP_PROOF')
    report.cleanup.resourceGovernorRelease=governor('release')
    report.cleanup.resourceGovernorRuntimeReleased=true
  })
  await step('verified-temp-removal',async()=>{
    if(!report.cleanup.portReleased||!report.cleanup.postgresProcessAbsent||!report.cleanup.clusterStopped)
      throw new Error('QC_CLEANUP_KEEP_UNVERIFIED_OR_RUNNING_CLUSTER')
    const resolved=fs.realpathSync(taskRoot),allowed=fs.realpathSync(os.tmpdir())
    assert.ok(resolved.startsWith(allowed+path.sep));assert.equal(resolved,path.resolve(taskRoot))
    fs.rmSync(resolved,{recursive:true,force:true});report.cleanup.tempRemoved=!fs.existsSync(taskRoot)
  })
  await step('primary-metadata-check',async()=>{
    report.primaryAfter=primaryMetadata();assert.deepEqual(report.primaryAfter,report.primaryBefore)
    report.cleanup.primaryMetadataUnchanged=true
  })
  await step('source-hash-check',async()=>{
    report.sourceHashesAfter=Object.fromEntries(Object.keys(report.sourceHashes).map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]))
    assert.deepEqual(report.sourceHashesAfter,report.sourceHashes)
  })
  if(errors.length){report.status='FAIL';process.exitCode=1}
  report.completedAt=new Date().toISOString()
  try{
    fs.mkdirSync(path.dirname(output),{recursive:true})
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
    process.stdout.write('QC '+report.status+' '+output+'\n')
  }catch(error){process.exitCode=1;process.stderr.write('QC_REPORT_WRITE_FAILED '+error.message+'\n')}
}
