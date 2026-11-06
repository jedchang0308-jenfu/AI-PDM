// Focused disposable proof only; imports have no connection or runtime effects.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createServer} from 'node:net'
import {Client} from 'pg'
import {planLocalStaticV8,assertLocalStaticV8Plan,commitLocalStaticV8,readLocalStaticV8Receipt,staticV8Profiles,staticV8Payload,assertStaticV8Source,STATIC_V8_MIGRATION,STATIC_V8_LEDGER} from './lib/dev127-local-owner-static-catalog.mjs'
import {dev127CommandId} from './lib/dev127-role-policy-upgrade.mjs'
import {hash} from './lib/dev127-local-owner-sql.mjs'

const read=filename=>fs.readFileSync(new URL('../'+filename,import.meta.url),'utf8')
const v7=JSON.parse(read('config/access-control/jenfu-role-catalog.v7.json'))
export async function runDev127StaticV8Proof({admin,connect}) {
  assertStaticV8Source()
  const database='dev127_static_v8_'+randomBytes(5).toString('hex')
  await admin.query(`CREATE DATABASE ${database}`)
  let client
  try {
    client=await connect(database)
    for(const role of ['jenfu_ai_pdm_migrator','jenfu_ai_pdm_runtime','jenfu_platform_runtime','jenfu_orgmaster_runtime','jenfu_orgmaster_migrator','jenfu_r1_verifier'])
      await admin.query(`DO $$BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF;END$$`)
    await client.query(`COMMENT ON DATABASE ${database} IS 'local-first-admin-corrected-genesis:16930fa3-b7cd-4c7c-947d-c3203e59178c';
      CREATE SCHEMA ai_pdm_core;CREATE SCHEMA ai_pdm_contract;
      GRANT USAGE,CREATE ON SCHEMA ai_pdm_core,ai_pdm_contract TO jenfu_ai_pdm_migrator;
      CREATE TABLE ai_pdm_core.schema_migrations(version text PRIMARY KEY,name text,checksum_sha256 char(64),source_revision text,applied_at timestamptz DEFAULT clock_timestamp());
      CREATE TABLE ai_pdm_core.role_catalog_publications(catalog_version text PRIMARY KEY,contract_version text,application_id text,published_at timestamptz,
        catalog_sha256 char(64),status text,published_by text,retired_at timestamptz,publication_format text,canonicalization_version text,role_schema_id text,
        role_profile_schema_id text,baseline_role_identity_hash char(64),role_identity_hash char(64),role_profile_hash char(64),protected_policy_hash char(64),
        registry_hash char(64),role_profiles jsonb,policy_draft_id uuid,base_catalog_version text,base_catalog_sha256 char(64),command_id uuid UNIQUE,publish_reason text);
      CREATE TABLE ai_pdm_core.role_catalog_entries(catalog_version text,display_order integer,stable_role_id text,role_code text,display_name text,
        assignable boolean,risk text,subject_kind text,recommendation_allowed boolean,delegation_allowed boolean,allowed_scope_kinds jsonb,assignment_tier text,
        permissions jsonb,metadata jsonb,role_definition_hash char(64),role_status text,PRIMARY KEY(catalog_version,stable_role_id));
      CREATE TABLE ai_pdm_core.active_role_catalog(application_id text PRIMARY KEY,catalog_version text,activated_at timestamptz,activated_by text,activation_reason text);
      CREATE TABLE ai_pdm_core.role_policy_role_identities(stable_role_id text PRIMARY KEY,role_code text UNIQUE,display_name text UNIQUE,origin text,
        identity_json jsonb,identity_hash char(64),first_catalog_version text REFERENCES ai_pdm_core.role_catalog_publications(catalog_version));
      CREATE TABLE ai_pdm_core.role_policy_drafts(draft_id uuid,status text);
      CREATE TABLE ai_pdm_core.role_policy_commands(request_id uuid);
      GRANT SELECT,INSERT ON ai_pdm_core.schema_migrations,ai_pdm_core.role_catalog_entries,ai_pdm_core.role_policy_role_identities TO jenfu_ai_pdm_migrator;
      GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.role_catalog_publications,ai_pdm_core.active_role_catalog TO jenfu_ai_pdm_migrator;
      GRANT SELECT ON ai_pdm_core.role_policy_drafts,ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_migrator;
      CREATE TABLE ai_pdm_core.unrelated_sentinel(id integer PRIMARY KEY,value text);INSERT INTO ai_pdm_core.unrelated_sentinel VALUES(1,'preserve');`)
    const m87=read('db/postgres/087_dev123_role_policy_candidate_validation.sql')
    await client.query(m87.slice(m87.indexOf('CREATE FUNCTION ai_pdm_core.dev123_canonical_json_v1'),m87.indexOf('CREATE FUNCTION ai_pdm_core.dev123_assert_candidate_v1')))
    const m96=read('db/postgres/096_dev127_platform_super_admin_consumer.sql')
    await client.query(m96.slice(m96.indexOf('CREATE VIEW ai_pdm_contract.v_application_role_catalog_v3'),m96.indexOf('-- Source-protected installation command')))
    await client.query('ALTER VIEW ai_pdm_contract.v_application_role_catalog_v3 OWNER TO jenfu_ai_pdm_migrator')
    for(let n=3;n<=7;n++)await client.query(`INSERT INTO ai_pdm_core.role_catalog_publications(catalog_version,contract_version,application_id,published_at,catalog_sha256,status)
      VALUES($1,'jenfu.platform-entitlement.v1','ai-pdm',clock_timestamp(),$2,$3)`,[n===7?v7.catalogVersion:'synthetic-historical-v'+n,n===7?v7.catalogSha256:String(n).repeat(64),n===7?'active':'retired'])
    for(const [index,role] of v7.roles.entries()) {
      await client.query('INSERT INTO ai_pdm_core.role_catalog_entries VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,\'active\')',
        [v7.catalogVersion,index,role.stableRoleId,role.roleCode,role.displayName,role.assignable,role.risk,role.subjectKind,role.recommendationAllowed,
          role.delegationAllowed,JSON.stringify(role.allowedScopeKinds),role.assignmentTier,JSON.stringify(role.permissions),JSON.stringify(role.metadata??null),role.roleDefinitionHash])
      const {permissions:_p,roleDefinitionHash:_h,...identity}=role;identity.metadata??=null
      await client.query('INSERT INTO ai_pdm_core.role_policy_role_identities VALUES($1,$2,$3,\'builtin\',$4,$5,$6)',
        [role.stableRoleId,role.roleCode,role.displayName,JSON.stringify(identity),hash(identity),v7.catalogVersion])
    }
    await client.query("INSERT INTO ai_pdm_core.active_role_catalog VALUES('ai-pdm',$1,clock_timestamp(),'synthetic','synthetic')",[v7.catalogVersion])
    const migrationSql=read(STATIC_V8_MIGRATION),commandId=dev127CommandId({sha256:'a'.repeat(64)}),sourceRevision='b'.repeat(40),bindingSha256='c'.repeat(64)
    const plan=await planLocalStaticV8(client,{commandId,sourceRevision,bindingSha256})
    for(const mutate of [p=>{p.extra='unsafe'},p=>{p.diff.changedLegacyPermissions=1},p=>{p.sourceRevision='invalid'},
      p=>{p.commandId='00000000-0000-4000-8000-000000000000'},p=>{p.resultingActive.catalogSha256='f'.repeat(64)}]) {
      const bad=structuredClone(plan);mutate(bad);const {planSha256:_hash,...core}=bad;bad.planSha256=hash(core)
      assert.throws(()=>assertLocalStaticV8Plan(bad),/STATIC_V8_PLAN_INVALID/)
    }
    const beforeEntries=(await client.query('SELECT * FROM ai_pdm_core.role_catalog_entries ORDER BY display_order')).rows
    const beforeIdentities=(await client.query('SELECT * FROM ai_pdm_core.role_policy_role_identities ORDER BY stable_role_id')).rows
    const beforeHistory=(await client.query('SELECT * FROM ai_pdm_core.role_catalog_publications ORDER BY catalog_version')).rows
    const acl=async()=> (await client.query(`SELECT c.relname,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='ai_pdm_core' AND c.relkind='r' AND c.relname<>'dev127_static_catalog_commands' ORDER BY c.relname`)).rows
    const beforeAcl=await acl()
    await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE jenfu_ai_pdm_migrator IN SCHEMA ai_pdm_core GRANT SELECT ON TABLES TO jenfu_orgmaster_migrator')
    await client.query('BEGIN;SET LOCAL ROLE jenfu_ai_pdm_migrator')
    await assert.rejects(client.query(migrationSql),/STATIC_OWNER_ACL_INVALID/)
    await client.query('ROLLBACK')
    await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE jenfu_ai_pdm_migrator IN SCHEMA ai_pdm_core REVOKE SELECT ON TABLES FROM jenfu_orgmaster_migrator')
    for(const values of [[null,sourceRevision,bindingSha256,v7.catalogVersion,v7.catalogSha256],
      [commandId,'bad',bindingSha256,v7.catalogVersion,v7.catalogSha256],[commandId,sourceRevision,bindingSha256,'wrong',v7.catalogSha256]]) {
      await client.query('BEGIN;SET LOCAL ROLE jenfu_ai_pdm_migrator');await client.query(migrationSql)
      await assert.rejects(client.query('SELECT ai_pdm_core.dev127_publish_static_v8($1,$2,$3,$4,$5)',values),error=>['42501','22023'].includes(error.code))
      await client.query('ROLLBACK')
      assert.equal((await client.query("SELECT to_regclass('ai_pdm_core.dev127_static_catalog_commands') AS name")).rows[0].name,null)
    }
    await client.query('UPDATE ai_pdm_core.role_catalog_publications SET catalog_sha256=$1 WHERE catalog_version=$2',['f'.repeat(64),v7.catalogVersion])
    await assert.rejects(commitLocalStaticV8({database:client,plan,migrationSql,revalidate:async()=>{},readAfterUnknown:()=>assert.fail('CAS rejection is definite')}),/STATIC_ACTIVE_CONFLICT/)
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM ai_pdm_core.schema_migrations')).rows[0].n,0)
    await client.query('UPDATE ai_pdm_core.role_catalog_publications SET catalog_sha256=$1 WHERE catalog_version=$2',[v7.catalogSha256,v7.catalogVersion])
    await client.query("UPDATE ai_pdm_core.role_catalog_entries SET role_status='inactive' WHERE catalog_version=$1 AND display_order=0",[v7.catalogVersion])
    await assert.rejects(commitLocalStaticV8({database:client,plan,migrationSql,revalidate:async()=>{},readAfterUnknown:()=>assert.fail('definite rollback is not unknown')}),/STATIC_ROLE_DRIFT/)
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM ai_pdm_core.schema_migrations')).rows[0].n,0)
    await client.query("UPDATE ai_pdm_core.role_catalog_entries SET role_status='active' WHERE catalog_version=$1 AND display_order=0",[v7.catalogVersion])
    let published=false,disconnect=true,publishCalls=0,unknownReads=0
    const transport={async query(sql,values){const result=await client.query(sql,values)
      if(sql.startsWith('SELECT ai_pdm_core.dev127_publish_static_v8')){published=true;publishCalls++}
      if(sql==='COMMIT' && published && disconnect){disconnect=false;throw new Error('synthetic disconnect after actual isolated COMMIT')}
      return result}}
    const result=await commitLocalStaticV8({database:transport,plan,migrationSql,revalidate:async()=>{},readAfterUnknown:async()=>{
      unknownReads++;const fresh=await connect(database);try{return await readLocalStaticV8Receipt(fresh,plan)}finally{await fresh.end()}
    }})
    assert.equal(result.disposition,'UNKNOWN_COMMIT_CONFIRMED_BY_STATIC_RECEIPT');assert.equal(publishCalls,1);assert.equal(unknownReads,1)
    assert.equal((await commitLocalStaticV8({database:client,plan,migrationSql,revalidate:()=>assert.fail('receipt replay cannot write'),readAfterUnknown:()=>assert.fail()})).disposition,'ORIGINAL_STATIC_COMMAND_REPLAY')
    assert.deepEqual((await client.query('SELECT * FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1 ORDER BY display_order',[v7.catalogVersion])).rows,beforeEntries)
    const next=(await client.query('SELECT * FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1 ORDER BY display_order',[staticV8Payload.catalog.catalogVersion])).rows
    assert.deepEqual(next.slice(0,9).map(row=>({...row,catalog_version:v7.catalogVersion})),beforeEntries)
    const identities=(await client.query('SELECT * FROM ai_pdm_core.role_policy_role_identities ORDER BY stable_role_id')).rows
    assert.deepEqual(identities.filter(row=>row.stable_role_id!=='role-application-system-admin'),beforeIdentities)
    const afterHistory=(await client.query('SELECT * FROM ai_pdm_core.role_catalog_publications ORDER BY catalog_version')).rows
    for(const row of beforeHistory) {
      const actual=afterHistory.find(x=>x.catalog_version===row.catalog_version)
      assert.deepEqual({...actual,status:row.status,retired_at:row.retired_at},row)
    }
    assert.deepEqual(await acl(),beforeAcl)
    assert.equal(next.length,10);assert.equal(identities.length,10)
    const profileRows=(await client.query('SELECT permission_role_id,presentation_name,presentation_order,assignment_disposition FROM ai_pdm_contract.v_application_role_catalog_v3 ORDER BY display_order')).rows
    assert.deepEqual(profileRows,staticV8Profiles.map(p=>({permission_role_id:p.permissionRoleId,presentation_name:p.presentationName,presentation_order:p.presentationOrder,assignment_disposition:p.assignmentDisposition})))
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM ai_pdm_core.role_policy_drafts')).rows[0].n,0)
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM ai_pdm_core.role_policy_commands')).rows[0].n,0)
    assert.equal((await client.query('SELECT count(*)::integer AS n FROM ai_pdm_core.schema_migrations WHERE version=$1',[STATIC_V8_LEDGER])).rows[0].n,1)
    const currentPlan=await planLocalStaticV8(client,{commandId,sourceRevision,bindingSha256})
    assert.equal(currentPlan.state,'ALREADY_CURRENT');assertLocalStaticV8Plan(currentPlan)
    await assert.rejects(commitLocalStaticV8({database:client,plan:currentPlan,migrationSql,revalidate:()=>assert.fail(),readAfterUnknown:()=>assert.fail()}),/STATIC_V8_READ_ONLY_CURRENT/)
    assert.equal((await client.query('SELECT value FROM ai_pdm_core.unrelated_sentinel')).rows[0].value,'preserve')
    await client.query('SET ROLE jenfu_ai_pdm_runtime')
    await assert.rejects(client.query('SELECT ai_pdm_core.dev127_publish_static_v8($1,$2,$3,$4,$5)',[commandId,sourceRevision,bindingSha256,v7.catalogVersion,v7.catalogSha256]),{code:'42501'})
    await assert.rejects(client.query('SELECT * FROM ai_pdm_core.dev127_static_catalog_commands'),{code:'42501'})
    await client.query('RESET ROLE')
    return {serverVersion:(await client.query('SHOW server_version')).rows[0].server_version,legacyRolesPreserved:9,legacyPermissionChanges:0,
      legacyProfileChanges:0,historyRowsPreserved:5,addedProtectedRole:1,assignmentWrites:0,businessDrafts:0,unknownReadbacks:1,writerCalls:1,runtimeDenied:true}
  }finally{if(client)await client.end();await admin.query(`DROP DATABASE ${database}`)}
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(process.argv.length!==2)throw new Error('NO_TARGET_OR_SQL_ARGUMENTS')
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'aipdm-dev127-static-pg-')),data=path.join(temporary,'data')
  const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/18/bin',exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''))
  const run=(name,args)=>{const r=spawnSync(exe(name),args,{encoding:'utf8',windowsHide:true,stdio:name==='pg_ctl'?'ignore':'pipe'});if(r.status!==0)throw new Error(name+' failed')}
  const port=await new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
  const connect=async(database='postgres')=>{const c=new Client({host:'127.0.0.1',port,database,user:'postgres'});await c.connect();return c}
  let started=false,admin
  try{
    run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',path.join(temporary,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c shared_buffers=16MB -c max_connections=12`,'-w','start']);started=true
    console.log(JSON.stringify({ownedTemporary:temporary,port,kind:'DISPOSABLE_STATIC_V8_ONLY'}))
    admin=await connect();console.log(JSON.stringify(await runDev127StaticV8Proof({admin,connect})))
  }finally{
    if(admin)await admin.end()
    if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop'])
    const resolved=fs.realpathSync(temporary)
    assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('aipdm-dev127-static-pg-'))
    fs.rmSync(resolved,{recursive:true,force:true})
  }
}
