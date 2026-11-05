import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { installDev127ConsumerFixture } from './lib/dev127-consumer-postgres-fixture.mjs'
import { deriveAiPdmMigration } from './dev010-n1c-ai-pdm-package.mjs'
import { hash,TABLES,FUNCTIONS,inspectLocalOwnerDatabase,buildLocalInstallPlan,installLocalDev127,
  readLocalInstallReceipt } from './lib/dev127-local-owner-sql.mjs'
import { executeDev127CatalogSql,DEV127_RECEIPT,DEV127_SOURCE_POLICY_SHA256,dev127CommandId } from './lib/dev127-role-policy-upgrade.mjs'

// This component belongs exclusively to the existing CI service PostgreSQL.
// Missing prerequisites fail the lane; there is no local/persistent fallback.
if(process.env.DEV012_ISOLATED_POSTGRES!=='1' || process.env.CI!=='true')throw new Error('DEV127_COMPONENT_REQUIRES_CI_DISPOSABLE_POSTGRES')
const endpoint=new URL(process.env.PDM_POSTGRES_URL??'')
if(endpoint.protocol!=='postgresql:' || endpoint.hostname!=='127.0.0.1' || endpoint.port!=='5432' || endpoint.pathname!=='/postgres' ||
  endpoint.username!=='postgres' || endpoint.search || endpoint.hash)throw new Error('DEV127_COMPONENT_TARGET_INVALID')
const suffix=randomBytes(5).toString('hex')
const dbName=`dev127_local_component_${suffix}`,runtimeUser=`dev127_component_runtime_${suffix}`
const root=new URL('../',import.meta.url)
const alignmentSql=await readFile(new URL('db/postgres/local/097_dev127_local_owner_alignment.sql',root),'utf8')
const migrationSource=await readFile(new URL('db/postgres/096_dev127_platform_super_admin_consumer.sql',root),'utf8')
const migrationSql=deriveAiPdmMigration('db/postgres/096_dev127_platform_super_admin_consumer.sql',migrationSource).output
const connect=async(database='postgres')=>{
  const owned=new URL(endpoint.href);owned.pathname=`/${database}`
  const value=new Client({connectionString:owned.href});await value.connect();return value
}

test('CI disposable component repairs only exact local ownership/ACL, installs original096 atomically, preserves data and upgrades via CAS/receipt',async()=>{
  const admin=await connect();let client
  try{
    for(const role of ['jenfu_ai_pdm_migrator','jenfu_ai_pdm_runtime','jenfu_platform_runtime','jenfu_orgmaster_runtime','jenfu_r1_verifier','jenfu_orgmaster_migrator'])
      await admin.query(`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF;END$$`)
    await admin.query(`CREATE ROLE ${runtimeUser} LOGIN;GRANT jenfu_ai_pdm_runtime TO ${runtimeUser}`)
    await admin.query(`CREATE DATABASE ${dbName}`)
    client=await connect(dbName)
    await client.query(`CREATE SCHEMA orgmaster_contract;CREATE SCHEMA platform_contract;
      GRANT USAGE ON SCHEMA orgmaster_contract,platform_contract TO jenfu_ai_pdm_migrator;
      CREATE FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v2() RETURNS void LANGUAGE sql AS $$SELECT$$;
      CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
      CREATE FUNCTION platform_contract.read_principal_auth_state_v3(text) RETURNS TABLE(principal_id text,auth_epoch bigint,revoked_before timestamptz)
        LANGUAGE sql AS $$SELECT $1,1::bigint,NULL::timestamptz$$;`)
    // Explicit synthetic producer contracts; no real Google/human/UI claim.
    await installDev127ConsumerFixture(client,{installConsumer:false})
    await client.query(`CREATE TABLE ai_pdm_core.schema_migrations(version text PRIMARY KEY,name text NOT NULL,checksum_sha256 char(64) NOT NULL,
      source_revision text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
      INSERT INTO ai_pdm_core.schema_migrations VALUES('synthetic-baseline','synthetic-baseline',repeat('b',64),'synthetic',clock_timestamp());
      CREATE TABLE ai_pdm_core.unrelated_sentinel(id integer PRIMARY KEY,value text);INSERT INTO ai_pdm_core.unrelated_sentinel VALUES(1,'preserve');`)
    const relationNames=[...TABLES.map(name=>'ai_pdm_core.'+name),'ai_pdm_contract.v_role_policy_publications_v1']
    for(const name of relationNames)await client.query(`ALTER ${name.endsWith('v_role_policy_publications_v1')?'VIEW':'TABLE'} ${name} OWNER TO postgres;REVOKE ALL ON ${name} FROM jenfu_ai_pdm_migrator`)
    for(const name of FUNCTIONS)await client.query(`ALTER FUNCTION ${name} OWNER TO postgres;REVOKE ALL ON FUNCTION ${name} FROM jenfu_ai_pdm_migrator`)
    await client.query(`ALTER SCHEMA ai_pdm_core OWNER TO postgres;ALTER SCHEMA ai_pdm_contract OWNER TO postgres;
      REVOKE ALL ON SCHEMA ai_pdm_core,ai_pdm_contract FROM jenfu_ai_pdm_migrator;
      GRANT USAGE ON SCHEMA ai_pdm_core,ai_pdm_contract TO jenfu_ai_pdm_runtime`)
    const target={database:dbName,port:5432,runtimeUser}
    await client.query('BEGIN READ ONLY;SET LOCAL ROLE jenfu_ai_pdm_migrator')
    await assert.rejects(client.query('SELECT version FROM ai_pdm_core.schema_migrations'),{code:'42501'});await client.query('ROLLBACK')
    const originalRows=(await client.query('SELECT * FROM ai_pdm_core.role_catalog_entries ORDER BY catalog_version,display_order')).rows
    let inventory
    try{inventory=await inspectLocalOwnerDatabase(client,target)}
    catch(error){
      if(error.code==='DEV127_LOCAL_DATABASE_BOUNDARY_INVALID') console.log('DEV127_CI_SAFE_BOUNDARY='+JSON.stringify(error.boundary))
      throw error
    }
    const binding={source:{revision:'a'.repeat(40)},migrationSource}
    const withoutGrantOption=alignmentSql.replace(/^GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_ai_pdm_migrator WITH GRANT OPTION;\n/mu,'')
    assert.notEqual(withoutGrantOption,alignmentSql)
    await assert.rejects(installLocalDev127({database:client,plan:buildLocalInstallPlan(binding,inventory,withoutGrantOption,migrationSql),
      alignmentSql:withoutGrantOption,migrationSql,
      revalidate:async db=>buildLocalInstallPlan(binding,await inspectLocalOwnerDatabase(db,target),withoutGrantOption,migrationSql),
      readAfterUnknown:async()=>assert.fail('a definite postcondition rejection must not read/retry unknown writes')}),/INSTALL_POSTCONDITIONS_INVALID/)
    assert.deepEqual((await client.query('SELECT version FROM ai_pdm_core.schema_migrations')).rows,[{version:'synthetic-baseline'}])
    const plan=buildLocalInstallPlan(binding,inventory,alignmentSql,migrationSql)
    let unknownReads=0
    const disconnectAfterCommit={async query(sql,values){const result=await client.query(sql,values);if(sql==='COMMIT')throw new Error('synthetic disconnect after actual CI COMMIT');return result}}
    const installed=await installLocalDev127({database:disconnectAfterCommit,plan,alignmentSql,migrationSql,
      revalidate:async db=>buildLocalInstallPlan(binding,await inspectLocalOwnerDatabase(db,target),alignmentSql,migrationSql),
      readAfterUnknown:async original=>{
        unknownReads++;const fresh=await connect(dbName)
        try{await fresh.query('BEGIN READ ONLY');await inspectLocalOwnerDatabase(fresh,target)
          const receipt=await readLocalInstallReceipt(fresh,original);await fresh.query('COMMIT');return receipt
        }finally{await fresh.end()}
      }})
    assert.equal(installed.state,'INSTALLED')
    assert.equal(installed.disposition,'UNKNOWN_COMMIT_CONFIRMED_BY_ORIGINAL_LEDGER')
    assert.equal(unknownReads,1)
    assert.equal((await readLocalInstallReceipt(client,plan)).state,'INSTALLED')
    assert.deepEqual((await client.query('SELECT * FROM ai_pdm_core.role_catalog_entries ORDER BY catalog_version,display_order')).rows,originalRows)
    assert.deepEqual((await client.query('SELECT * FROM ai_pdm_core.unrelated_sentinel')).rows,[{id:1,value:'preserve'}])
    const after=await inspectLocalOwnerDatabase(client,target)
    assert.ok(after.schemas.every(row=>row.owner==='postgres'))
    assert.ok(after.relations.filter(row=>row.name.startsWith('ai_pdm_core.')).every(row=>row.owner==='postgres'))
    assert.equal((await client.query(`SELECT has_table_privilege('jenfu_ai_pdm_migrator','ai_pdm_core.unrelated_sentinel','SELECT') AS allowed`)).rows[0].allowed,false)
    assert.equal((await client.query(`SELECT pg_has_role($1,'jenfu_ai_pdm_migrator','MEMBER') AS member`,[runtimeUser])).rows[0].member,false)
    await client.query(`GRANT CREATE ON DATABASE ${dbName} TO ${runtimeUser}`)
    await assert.rejects(inspectLocalOwnerDatabase(client,target),/DATABASE_BOUNDARY_INVALID/)
    await client.query(`REVOKE CREATE ON DATABASE ${dbName} FROM ${runtimeUser}`)
    const ref={uri:'local:synthetic-component',sha256:hash({component:suffix})}
    const operation={phase:'plan',commandId:dev127CommandId(ref),sourceRevision:'a'.repeat(40),releaseCapsuleRef:ref,sourcePolicySha256:DEV127_SOURCE_POLICY_SHA256}
    const planned=await executeDev127CatalogSql({database:client,operation})
    const catalogPlan={schemaVersion:DEV127_RECEIPT,...operation,...planned}
    const result=await executeDev127CatalogSql({database:client,operation:{...operation,phase:'commit'},plan:catalogPlan,
      readAfterUnknown:async()=>assert.fail('ordinary catalog commit is not unknown')})
    assert.equal(result.state,'SUCCEEDED')
    assert.equal((await executeDev127CatalogSql({database:client,operation:{...operation,phase:'status'},plan:catalogPlan})).disposition,'ORIGINAL_COMMAND_REPLAY')
    assert.equal(Number((await client.query('SELECT count(*) FROM ai_pdm_contract.v_application_role_catalog_v3')).rows[0].count),11)
    assert.equal((await client.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime',
      'ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,character,text)','EXECUTE') AS allowed`)).rows[0].allowed,false)
  }finally{
    if(client)await client.end()
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin.query(`DROP ROLE IF EXISTS ${runtimeUser}`)
    await admin.end()
  }
})
