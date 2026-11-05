import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile,mkdtemp,mkdir,writeFile,open,rename,rm,realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deriveAiPdmMigration } from '../dev010-n1c-ai-pdm-package.mjs'
import { parseDev127LocalOwnerArgs } from '../dev127-local-owner.mjs'
import { localClusterRecordPath,readLocalBoundedBytes,readLocalBoundedHandle,
  assertLocalMigratorIdentity,assertLocalAdcSnapshot } from './dev127-local-owner-bridge.mjs'
import { hash,buildLocalInstallPlan,installLocalDev127,readLocalInstallReceipt,
  LOCAL_ALIGNMENT_VERSION,LOCAL_ALIGNMENT_NAME,MIGRATION_VERSION,MIGRATION_NAME,MIGRATION_APPLIED_SHA,
  inspectLocalOwnerDatabase,TABLES,FUNCTIONS } from './dev127-local-owner-sql.mjs'

const root=new URL('../../',import.meta.url)
const alignmentSql=await readFile(new URL('db/postgres/local/097_dev127_local_owner_alignment.sql',root),'utf8')
const migrationSource=await readFile(new URL('db/postgres/096_dev127_platform_super_admin_consumer.sql',root),'utf8')
const migrationSql=deriveAiPdmMigration('db/postgres/096_dev127_platform_super_admin_consumer.sql',migrationSource).output
const binding={source:{revision:'a'.repeat(40)},migrationSource}
const inventory={ledger:[{version:'old',name:'old',checksum:'b'.repeat(64)}],
  contracts:[{oid:1,executable:true},{oid:2,executable:true},{oid:3,executable:true}],usage:[{usable:true},{usable:true}]}
const plan=()=>buildLocalInstallPlan(binding,structuredClone(inventory),alignmentSql,migrationSql)
function fixture({commitError=null,prior=[],changed=null,readback=null}={}) {
  const calls=[];let freshReads=0
  const database={async query(sql,values){calls.push({sql,values});
    if(sql.startsWith('SELECT version,name'))return {rows:prior}
    if(sql==='COMMIT' && commitError)throw commitError
    return {rows:[]}
  }}
  const input={database,plan:plan(),alignmentSql,migrationSql,revalidate:async()=>changed??plan(),
    readAfterUnknown:async()=>{freshReads++;return readback}}
  return {calls,input,reads:()=>freshReads}
}
test('exact source plan binds the entire baseline and rejects altered 096 or plan inventory',async()=>{
  assert.equal(hash(migrationSql),MIGRATION_APPLIED_SHA)
  assert.throws(()=>buildLocalInstallPlan(binding,inventory,alignmentSql,migrationSql+' '),/MIGRATION_SOURCE_INVALID/)
  const f=fixture();f.input.plan.inventory.ledger[0].checksum='c'.repeat(64)
  await assert.rejects(installLocalDev127(f.input),/PLAN_INVALID/)
  assert.equal(f.calls.length,0)
})
test('install aligns then switches only to the existing migrator, installs 096 and appends both receipts before one commit',async()=>{
  const f=fixture();assert.equal((await installLocalDev127(f.input)).state,'INSTALLED')
  const sql=f.calls.map(row=>row.sql)
  assert.ok(sql.indexOf(alignmentSql)<sql.indexOf('SET LOCAL ROLE jenfu_ai_pdm_migrator'))
  assert.ok(sql.indexOf('SET LOCAL ROLE jenfu_ai_pdm_migrator')<sql.indexOf(migrationSql))
  assert.equal(sql.filter(row=>row==='COMMIT').length,1)
  assert.deepEqual(f.calls.find(row=>row.sql.startsWith('INSERT INTO'))?.values,
    [LOCAL_ALIGNMENT_VERSION,`${LOCAL_ALIGNMENT_NAME}_${f.input.plan.planSha256}`,hash(alignmentSql),f.input.plan.binding.source.revision,
      MIGRATION_VERSION,MIGRATION_NAME,MIGRATION_APPLIED_SHA,'a'.repeat(40)])
})
test('inventory drift and missing external-owner contract ACL stop before alignment',async t=>{
  for(const kind of ['ledger','oid','definition','acl','owner','contract'])await t.test(kind,async()=>{
    const changed=plan()
    if(kind==='ledger')changed.inventory.ledger[0].checksum='c'.repeat(64)
    else if(kind==='contract')changed.inventory.contracts[0].executable=false
    else changed.inventory[kind]='changed'
    const f=fixture({changed})
    await assert.rejects(installLocalDev127(f.input),/PLAN_DRIFT/)
    assert.ok(!f.calls.some(row=>row.sql===alignmentSql))
    assert.equal(f.calls.at(-1).sql,'ROLLBACK')
  })
  const f=fixture();f.input.plan.inventory.contracts[0].executable=false
  const {planSha256,...core}=f.input.plan;f.input.plan={...core,planSha256:hash(core)}
  f.input.revalidate=async()=>f.input.plan
  await assert.rejects(installLocalDev127(f.input),/CONTRACT_OWNER_PREREQUISITE_MISSING/)
  assert.ok(!f.calls.some(row=>row.sql===alignmentSql))
})
test('unknown COMMIT uses one new-session receipt read and never sends a second writer',async()=>{
  for(const confirmed of [true,false]){
    const f=fixture({commitError:new Error('connection lost'),readback:confirmed?{state:'INSTALLED'}:null})
    if(confirmed)assert.equal((await installLocalDev127(f.input)).disposition,'UNKNOWN_COMMIT_CONFIRMED_BY_ORIGINAL_LEDGER')
    else await assert.rejects(installLocalDev127(f.input),/INSTALL_OUTCOME_UNKNOWN/)
    assert.equal(f.reads(),1);assert.equal(f.calls.filter(row=>row.sql===alignmentSql).length,1)
  }
})
test('definite transaction rejection rolls back without an unknown-outcome retry',async()=>{
  const f=fixture({commitError:Object.assign(new Error('denied'),{code:'42501'})})
  await assert.rejects(installLocalDev127(f.input),{code:'42501'});assert.equal(f.reads(),0)
})
test('receipt readback requires both exact checksums, plan binding and source, rejecting partial or modified receipts',async()=>{
  const p=plan(),rows=[{version:LOCAL_ALIGNMENT_VERSION,name:`${LOCAL_ALIGNMENT_NAME}_${p.planSha256}`,checksum:p.alignmentSha256,source_revision:p.binding.source.revision},
    {version:MIGRATION_VERSION,name:MIGRATION_NAME,checksum:MIGRATION_APPLIED_SHA,source_revision:p.binding.source.revision}]
  const withBaseline=values=>[...inventory.ledger,...values]
  assert.equal((await readLocalInstallReceipt({query:async()=>({rows:withBaseline(rows)})},p)).state,'INSTALLED')
  for(const wrong of [rows.slice(0,1),[rows[0],{...rows[1],checksum:'c'.repeat(64)}],[{...rows[0],source_revision:'c'.repeat(64)},rows[1]]])
    await assert.rejects(readLocalInstallReceipt({query:async()=>({rows:withBaseline(wrong)})},p),/INSTALL_RECEIPT_CONFLICT/)
  await assert.rejects(readLocalInstallReceipt({query:async()=>({rows:[{...inventory.ledger[0],checksum:'c'.repeat(64)},...rows]})},p),/INSTALL_RECEIPT_CONFLICT/)
  const f=fixture({prior:withBaseline(rows)});assert.equal((await installLocalDev127(f.input)).disposition,'ORIGINAL_INSTALL_RECEIPT')
  assert.ok(!f.calls.some(row=>row.sql===alignmentSql))
})
test('closed local SQL has only exact own-schema ACL/three owner changes and no role, data, DELETE or sibling-core writes',()=>{
  assert.equal((alignmentSql.match(/^ALTER /gmu)??[]).length,3)
  assert.equal((alignmentSql.match(/OWNER TO jenfu_ai_pdm_migrator/gmu)??[]).length,3)
  assert.doesNotMatch(alignmentSql,/\b(?:ALL PRIVILEGES|GRANT ALL|CREATE ROLE|ALTER ROLE|REASSIGN OWNED|DELETE FROM|UPDATE .* SET|INSERT INTO|DROP)\b/iu)
  assert.doesNotMatch(alignmentSql,/(?:platform|orgmaster|fms)_core|\bTO (?:postgres|jenfu_ai_pdm_runtime)\b/u)
})
test('CLI accepts only private profile, closed phase and content-addressed plan reference; free URL/role/SQL are rejected',()=>{
  assert.deepEqual(parseDev127LocalOwnerArgs(['--profile','private','--phase','plan']),{profilePath:'private',phase:'plan'})
  for(const option of ['--database-url','--sql','--role','--actor'])
    assert.throws(()=>parseDev127LocalOwnerArgs(['--profile','private','--phase','install',option,'unsafe']),/ARGUMENT_INVALID/)
})
test('actual neutral layout is private/control; growth is bounded and replacement is rejected by the reader or Windows open-file protection',async()=>{
  const temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'dev127-owner-reader-')))
  try{
    const record=localClusterRecordPath(temporary)
    assert.equal(record,path.join(temporary,'private','control','cluster.json'))
    await mkdir(path.dirname(record),{recursive:true});await writeFile(record,'{"source":"synthetic"}')
    assert.equal((await readLocalBoundedBytes(record)).toString(),'{"source":"synthetic"}')
    await assert.rejects(readLocalBoundedBytes(record,4),/FILE_INVALID/)
    await writeFile(record,'start')
    const file=await open(record,'r');let mutated=false,largestRead=0
    try{
      await assert.rejects(readLocalBoundedHandle({stat:options=>file.stat(options),async read(buffer,offset,length,position){
        largestRead=Math.max(largestRead,length)
        if(!mutated){mutated=true;await writeFile(record,'x'.repeat(1024*1024))}
        return file.read(buffer,offset,length,position)
      }},record,32),/FILE_CHANGED/)
      assert.ok(largestRead<=33)
    }finally{await file.close()}
    await writeFile(record,'start')
    const old=await open(record,'r');mutated=false
    try{
      await assert.rejects(readLocalBoundedHandle({stat:options=>old.stat(options),async read(...args){
        if(!mutated){mutated=true;const replacement=path.join(temporary,'replacement');await writeFile(replacement,'start');await rename(replacement,record)}
        return old.read(...args)
      }},record,32),error=>/FILE_CHANGED/u.test(error.message) || process.platform==='win32' && error.code==='EPERM')
    }finally{await old.close()}
  }finally{
    assert.equal(path.dirname(temporary),await realpath(os.tmpdir()))
    assert.ok(path.basename(temporary).startsWith('dev127-owner-reader-'))
    await rm(temporary,{recursive:true,force:true})
  }
})
test('exact DEV migrator Google payload and private nonprod quota are required; runtime/stg/Org identities cannot substitute',()=>{
  const identity={iss:'https://accounts.google.com',aud:'http://localhost:1020',
    email:'dev010-aipdm-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com',sub:'100840550008830914692',email_verified:true}
  assert.doesNotThrow(()=>assertLocalMigratorIdentity(identity))
  for(const change of [{iss:'https://example.invalid'},{aud:'https://production.invalid'},{email_verified:false},
    {sub:'113505461308210636714'},
    {email:'dev010-stg-aipdm-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com'},
    {email:'dev010-aipdm-runtime@jenfu-platform-nonprod.iam.gserviceaccount.com',sub:'114595537486979999938'},
    {email:'dev010-orgmaster-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com'}])
    assert.throws(()=>assertLocalMigratorIdentity({...identity,...change}),/OIDC_IDENTITY_INVALID/)
  const adc={type:'authorized_user',quota_project_id:'jenfu-platform-nonprod',client_id:'synthetic',client_secret:'synthetic',refresh_token:'secret-sentinel'}
  assert.doesNotThrow(()=>assertLocalAdcSnapshot(adc))
  for(const change of [{quota_project_id:'jenfu-platform-prod'},{quota_project_id:undefined},{type:'service_account'},{refresh_token:''}])
    assert.throws(()=>assertLocalAdcSnapshot({...adc,...change}),error=>error.message==='DEV127_LOCAL_ADC_INVALID')
})
test('actual operator target gate rejects runtime database CREATE, migrator membership and privileged/current-user drift',async()=>{
  const target={database:'synthetic',port:61312,runtimeUser:'runtime'}
  const connection={database:target.database,host:'127.0.0.1',port:target.port,major:18,session_user:'postgres',current_user:'postgres',rolcanlogin:true,runtime_member:true,
    ...Object.fromEntries(['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','runtime_owner','runtime_migrator',
      'runtime_database_create','runtime_schema_create','runtime_unsafe','migrator_unsafe'].map(key=>[key,false]))}
  const db=changed=>({query:async sql=>{
    if(sql.includes('current_database() AS database'))return {rows:[{...connection,...changed}]}
    if(sql.includes('FROM pg_namespace n'))return {rows:[{name:'ai_pdm_core',owner:'postgres'},{name:'ai_pdm_contract',owner:'postgres'}]}
    if(sql.includes('FROM pg_class c'))return {rows:[...TABLES.map(name=>({name:'ai_pdm_core.'+name,owner:'postgres',columns:name==='schema_migrations'?
      [{name:'name',type:25},{name:'source_revision',type:25}]:[]})),{name:'ai_pdm_contract.v_role_policy_publications_v1',owner:'postgres'}]}
    if(sql.includes('FROM pg_proc p'))return {rows:FUNCTIONS.map(signature=>({signature,owner:'postgres'}))}
    if(sql.includes('FROM unnest($1::text[]) signature'))return {rows:[{oid:1,executable:true},{oid:2,executable:true},{oid:3,executable:true}]}
    if(sql.includes("FROM unnest(ARRAY['orgmaster_contract'"))return {rows:[{usable:true},{usable:true}]}
    if(sql.includes('FROM ai_pdm_core.schema_migrations'))return {rows:inventory.ledger}
    throw new Error('unexpected inventory query')
  }})
  assert.ok((await inspectLocalOwnerDatabase(db({}),target)).ledger.length)
  for(const key of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls','runtime_owner','runtime_migrator',
    'runtime_database_create','runtime_schema_create','runtime_unsafe','migrator_unsafe'])
    await assert.rejects(inspectLocalOwnerDatabase(db({[key]:true}),target),/DATABASE_BOUNDARY_INVALID/)
  for(const change of [{database:'other'},{host:'remote'},{port:5432},{major:17},{current_user:'jenfu_ai_pdm_migrator'},
    {session_user:'other'},{runtime_member:false},{rolcanlogin:false}])
    await assert.rejects(inspectLocalOwnerDatabase(db(change),target),/DATABASE_BOUNDARY_INVALID/)
})
