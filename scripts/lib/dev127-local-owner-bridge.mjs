import { execFileSync } from 'node:child_process'
import { lstat,open,realpath,readFile,mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL,fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { OAuth2Client,UserRefreshClient,Impersonated } from 'google-auth-library'
import { deriveAiPdmMigration } from '../dev010-n1c-ai-pdm-package.mjs'
import { DEV127_RECEIPT,DEV127_SOURCE_POLICY_SHA256,dev127CommandId,executeDev127CatalogSql,
  readDev127CommandReceipt } from './dev127-role-policy-upgrade.mjs'
import { assertDev127InstalledMigration } from './dev127-catalog-job.mjs'
import {STATIC_V8_KIND,STATIC_V8_MIGRATION,planLocalStaticV8,assertLocalStaticV8Plan,commitLocalStaticV8,readLocalStaticV8Receipt} from './dev127-local-owner-static-catalog.mjs'
import { hash,fail,inspectLocalOwnerDatabase,buildLocalInstallPlan,assertLocalInstallPlan,
  installLocalDev127,readLocalInstallReceipt,assertLocalOwnerContracts,inspectLocalDev127Catalog,MIGRATION_SOURCE_SHA,LOCAL_ALIGNMENT_VERSION } from './dev127-local-owner-sql.mjs'

const PROJECT='jenfu-platform-nonprod'
const RUNTIME_EMAIL=`dev010-aipdm-runtime@${PROJECT}.iam.gserviceaccount.com`
const RUNTIME_SUBJECT='114595537486979999938'
const EMAIL=`dev010-aipdm-migrator@${PROJECT}.iam.gserviceaccount.com`
const SUBJECT='100840550008830914692'
const AUDIENCE='http://localhost:1020'
const POINTER_SHA='daa4d4e1a7144377f965a4d39f28aefc6adc468258a8ffef904e515270d237ce'
const SQL_SHA='7b88fa89e986fee033d6b3426a393188379f1061b1052c1f65f7373b15093c0f'
const DATABASE='jenfu_local_first_admin_shijie_20261105_16930fa3'
const DATABASE_MARKER='local-first-admin-corrected-genesis:16930fa3-b7cd-4c7c-947d-c3203e59178c'
const INSPECTOR='scripts/lib/dev021-local-postgres-cluster.mjs'
const NEUTRAL_PINS={
  [INSPECTOR]:'d321094cb62b8a0b7f84c80e9d6edb32302a78476555a70076a03c37f2960376',
  'scripts/lib/dev-local-process-ownership.mjs':'517ac9fa62203ebdaddf27d4b12198fc271a5bf262223e16a45f11d570c326d5',
}
const OWNER_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const ALIGNMENT='db/postgres/local/097_dev127_local_owner_alignment.sql'
const MIGRATION='db/postgres/096_dev127_platform_super_admin_consumer.sql'
const SOURCE_FILES=['scripts/lib/dev127-local-owner-bridge.mjs','scripts/lib/dev127-local-owner-sql.mjs',
  'scripts/dev127-local-owner.mjs','scripts/lib/dev127-role-policy-upgrade.mjs','scripts/lib/dev127-catalog-job.mjs',
  'scripts/lib/dev012-production-migration-runner.mjs','scripts/dev010-n1c-ai-pdm-package.mjs',
  'config/platform/dev-010-n1c-ai-pdm.json','config/access-control/dev127-protected-policy-source.v1.json',
  'config/access-control/role-policy-editor-registry.v3.json',
  'config/access-control/jenfu-role-catalog.v7.json',
  'config/access-control/jenfu-role-catalog.v8.json','scripts/lib/dev127-local-owner-static-catalog.mjs',STATIC_V8_MIGRATION,
  'config/access-control/ai-pdm-role-policy-contract-v3.manifest.json','src/lib/jenfu-principal-role-catalog.ts',ALIGNMENT,MIGRATION]
const H64=/^[a-f0-9]{64}$/u
const exact=(value,keys)=>value && Object.getPrototypeOf(value)===Object.prototype &&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',')
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)

export async function canonicalLocalFile(filename,directory=false) {
  if (typeof filename!=='string' || !path.isAbsolute(filename) || path.resolve(filename)!==filename) fail('PATH_INVALID')
  for(let cursor=filename,depth=0;;depth++) {
    if(depth>64) fail('PATH_INVALID')
    const stat=await lstat(cursor)
    if(stat.isSymbolicLink() || (cursor===filename ? directory?!stat.isDirectory():!stat.isFile() : !stat.isDirectory())) fail('PATH_INVALID')
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent
  }
  if(await realpath(filename)!==filename)fail('PATH_INVALID')
  return filename
}
export async function readLocalBoundedHandle(file,filename,maximum) {
  const before=await file.stat({bigint:true})
  if(!before.isFile() || before.size<1n || before.size>BigInt(maximum))fail('FILE_INVALID')
  const buffer=Buffer.alloc(maximum+1)
  let length=0
  while(length<buffer.length) {
    const read=await file.read(buffer,length,buffer.length-length,length)
    if(read.bytesRead===0)break
    length+=read.bytesRead
  }
  const after=await file.stat({bigint:true})
  await canonicalLocalFile(filename)
  const pathname=await lstat(filename,{bigint:true})
  if(length>maximum || BigInt(length)!==before.size ||
    ['dev','ino','size','mtimeNs','ctimeNs','mode'].some(key=>before[key]!==after[key] || after[key]!==pathname[key]))fail('FILE_CHANGED')
  return buffer.subarray(0,length)
}
export async function readLocalBoundedBytes(filename,maximum=128*1024) {
  await canonicalLocalFile(filename)
  const file=await open(filename,'r')
  try{return await readLocalBoundedHandle(file,filename,maximum)}finally{await file.close()}
}
const bytes=readLocalBoundedBytes
async function json(filename,maximum) {
  const data=await bytes(filename,maximum)
  try{return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)),sha256:hash(data)}}
  catch{fail('JSON_INVALID')}
}
async function sourceBinding(root) {
  await canonicalLocalFile(root,true)
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim()
  if(git(['status','--porcelain','--untracked-files=normal']))fail('SOURCE_NOT_CLEAN')
  const revision=git(['rev-parse','HEAD'])
  if(!/^[a-f0-9]{40}$/u.test(revision))fail('SOURCE_INVALID')
  const files={}
  for(const filename of SOURCE_FILES) files[filename]=hash(await bytes(path.join(root,filename),2*1024*1024))
  if(files[MIGRATION]!==MIGRATION_SOURCE_SHA)fail('MIGRATION_SOURCE_INVALID')
  return {revision,files}
}

/** Private context never leaves this module. No caller DB URL, operator login,
 * role selector, verifier or SQL is accepted by the public bridge. */
async function context(profilePath) {
  if(process.platform!=='win32' || Object.hasOwn(process.env,'K_SERVICE') || Object.hasOwn(process.env,'CLOUD_RUN_JOB'))fail('LOCAL_ONLY')
  const root=await canonicalLocalFile(OWNER_ROOT,true)
  const source=await sourceBinding(root)
  const pointerFile=await json(profilePath,64*1024)
  if(pointerFile.sha256!==POINTER_SHA)fail('POINTER_CHANGED')
  const pointer=pointerFile.value
  if(!exact(pointer,['format','privateRoot','clusterRoot','roots','identities','directory','supportEmail']) ||
    pointer.format!=='jenfu.dev-local-auth-profile.v1' || pointer.roots?.aiPdm!==root ||
    !exact(pointer.identities?.aiPdm,['email','subject']) || pointer.identities.aiPdm.email!==RUNTIME_EMAIL ||
    pointer.identities.aiPdm.subject!==RUNTIME_SUBJECT || path.basename(pointer.privateRoot)!=='dev069-real-nonprod-e598c60a4bc64ee5889048bb4355f7c0' ||
    profilePath!==path.join(pointer.privateRoot,'private','dev022-authenticated-local-profile.json'))fail('POINTER_INVALID')
  await canonicalLocalFile(pointer.privateRoot,true)
  await canonicalLocalFile(pointer.clusterRoot,true)
  await canonicalLocalFile(pointer.roots.platformSandbox,true)
  const sqlFile=await json(path.join(pointer.privateRoot,'private','owner-runtime-logins.json'))
  if(sqlFile.sha256!==SQL_SHA)fail('SQL_PROFILE_CHANGED')
  const sql=sqlFile.value,app=sql?.apps?.aipdm
  if(!exact(sql,['format','runId','host','port','database','apps']) || sql.format!=='dev069.real-nonproduction-runtime-logins.v1' ||
    sql.runId!=='e598c60a4bc64ee5889048bb4355f7c0' || sql.host!=='127.0.0.1' || sql.port!==61312 || sql.database!==DATABASE ||
    !exact(app,['user','password','group','url','pepper']) || app.group!=='jenfu_ai_pdm_runtime' || /owner|migrator/iu.test(app.user))fail('SQL_PROFILE_INVALID')
  let url
  try{url=new URL(app.url)}catch{fail('SQL_PROFILE_INVALID')}
  if(!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!==sql.host || Number(url.port)!==sql.port ||
    decodeURIComponent(url.pathname.slice(1))!==sql.database || decodeURIComponent(url.username)!==app.user ||
    decodeURIComponent(url.password)!==app.password || url.hash || [...url.searchParams.keys()].some(key=>key!=='application_name'))fail('SQL_PROFILE_INVALID')
  for(const [filename,expected] of Object.entries(NEUTRAL_PINS)) {
    if(hash(await bytes(path.join(pointer.roots.platformSandbox,filename)))!==expected)fail('NEUTRAL_SOURCE_CHANGED')
  }
  const inspector=await import(pathToFileURL(path.join(pointer.roots.platformSandbox,INSPECTOR)).href)
  const cluster=await inspector.inspectLocalPostgresCluster({taskRoot:pointer.clusterRoot})
  if(cluster.root!==pointer.clusterRoot || !Number.isSafeInteger(cluster.postmaster?.pid) || cluster.postmaster.pid<1 || cluster.postmaster.port!==sql.port ||
    cluster.postmaster.dataDirectory!==path.join(pointer.clusterRoot,'data') || !cluster.adminConnection ||
    Object.keys(cluster).includes('adminConnection') || cluster.adminConnection.host!=='127.0.0.1' ||
    cluster.adminConnection.port!==sql.port || cluster.adminConnection.user!=='postgres')fail('POSTMASTER_INVALID')
  const processReader=await import(pathToFileURL(path.join(pointer.roots.platformSandbox,'scripts/lib/dev-local-process-ownership.mjs')).href)
  const processes=await processReader.readWindowsProcessSnapshot(cluster.postmaster.pid)
  const peer=processes.filter(row=>row.pid===cluster.postmaster.pid)
  const clusterRecord=await json(localClusterRecordPath(pointer.clusterRoot))
  if(peer.length!==1 || !/^[1-9][0-9]{0,19}$/u.test(peer[0].startToken??'') ||
    !processReader.processFingerprintMatches(clusterRecord.value.postmaster,peer[0]))fail('POSTMASTER_INVALID')
  const adcFile=await json(path.join(pointer.privateRoot,'private','google-adc','application_default_credentials.json'),64*1024)
  const adc=adcFile.value
  assertLocalAdcSnapshot(adc)
  const credentials=new UserRefreshClient(adc.client_id,adc.client_secret,adc.refresh_token)
  credentials.quotaProjectId=PROJECT
  const oidc=new Impersonated({sourceClient:credentials,targetPrincipal:EMAIL,targetScopes:[],lifetime:300})
  const token=await oidc.fetchIdToken(AUDIENCE,{includeEmail:true})
  const identity=(await new OAuth2Client().verifyIdToken({idToken:token,audience:AUDIENCE})).getPayload()
  assertLocalMigratorIdentity(identity)
  const runtime=new Client({connectionString:app.url,ssl:false,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,options:'-c search_path=pg_catalog'})
  await runtime.connect()
  try{
    const {rows}=await runtime.query('SELECT current_database() AS database,session_user,current_user,host(inet_server_addr()) AS host,inet_server_port() AS port')
    const row=rows[0]
    if(rows.length!==1 || row.database!==sql.database || row.host!==sql.host || row.port!==sql.port ||
      row.current_user!==app.user || row.session_user!==app.user)fail('RUNTIME_SESSION_INVALID')
  }finally{await runtime.end()}
  const migrationSource=(await bytes(path.join(root,MIGRATION),2*1024*1024)).toString('utf8')
  const alignmentSql=(await bytes(path.join(root,ALIGNMENT))).toString('utf8')
  const migrationSql=deriveAiPdmMigration(MIGRATION,migrationSource).output
  const binding={profilePath,profileSha256:pointerFile.sha256,sqlProfileSha256:sqlFile.sha256,adcSha256:adcFile.sha256,
    ownerRoot:root,source,neutralPins:NEUTRAL_PINS,clusterRecordSha256:clusterRecord.sha256,
    target:{host:sql.host,port:sql.port,database:sql.database,marker:DATABASE_MARKER,runtimeUser:app.user},
    postmaster:{...cluster.postmaster,startToken:peer[0].startToken},identity:{issuer:identity.iss,email:EMAIL,subject:SUBJECT,audience:AUDIENCE}}
  const staticMigrationSql=(await bytes(path.join(root,STATIC_V8_MIGRATION),2*1024*1024)).toString('utf8')
  return {binding,pointer,alignmentSql,migrationSql,migrationSource,staticMigrationSql,
    operatorOptions:{...cluster.adminConnection,database:sql.database,ssl:false,connectionTimeoutMillis:5000,
      statement_timeout:30000,query_timeout:35000,options:'-c search_path=pg_catalog'}}
}

export function localClusterRecordPath(clusterRoot) {return path.join(clusterRoot,'private','control','cluster.json')}
export function assertLocalAdcSnapshot(adc) {
  if(adc?.type!=='authorized_user' || adc.quota_project_id!==PROJECT ||
    !['client_id','client_secret','refresh_token'].every(key=>typeof adc[key]==='string' && adc[key]))fail('ADC_INVALID')
}
export function assertLocalMigratorIdentity(identity) {
  if(!identity || !['accounts.google.com','https://accounts.google.com'].includes(identity.iss) || identity.aud!==AUDIENCE ||
    identity.email!==EMAIL || identity.sub!==SUBJECT || identity.email_verified!==true)fail('OIDC_IDENTITY_INVALID')
}

async function withContext(profilePath,work) {
  const state=await context(profilePath)
  const database=new Client(state.operatorOptions)
  await database.connect()
  try{return await work(database,state)}finally{await database.end()}
}
async function readonly(database,work) {
  await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try{const result=await work();await database.query('COMMIT');return result}
  catch(error){await database.query('ROLLBACK').catch(()=>{});throw error}
}
async function inspect(database,state) {
  return inspectLocalOwnerDatabase(database,state.binding.target)
}
function installPlan(state,inventory) {
  return buildLocalInstallPlan({...state.binding,migrationSource:state.migrationSource},inventory,state.alignmentSql,state.migrationSql)
}
async function save(state,prefix,value) {
  const parent=path.join(state.pointer.privateRoot,'private','dev127-local-owner')
  await mkdir(parent,{recursive:true,mode:0o700});await canonicalLocalFile(parent,true)
  const sha256=hash(value),filename=path.join(parent,`${prefix}-${sha256}.json`)
  const content=JSON.stringify(value,null,2)+'\n'
  try{await writeFile(filename,content,{flag:'wx',mode:0o600})}
  catch(error){if(error.code!=='EEXIST')throw error;if((await readFile(await canonicalLocalFile(filename),'utf8'))!==content)fail('IMMUTABLE_RECEIPT_CONFLICT')}
  return {path:filename,sha256}
}
async function load(state,prefix,sha256) {
  if(!H64.test(sha256??''))fail('PLAN_REFERENCE_INVALID')
  const row=await json(path.join(state.pointer.privateRoot,'private','dev127-local-owner',`${prefix}-${sha256}.json`),2*1024*1024)
  if(hash(row.value)!==sha256)fail('PLAN_REFERENCE_INVALID')
  return row.value
}
function assertBinding(state,binding) {
  if(!same(state.binding,binding))fail('PLAN_BINDING_CHANGED')
}

export async function runDev127LocalOwner({profilePath,phase,planSha256}) {
  if(!['plan','install','install-status','catalog-plan','catalog-commit','catalog-status','catalog-inspect'].includes(phase))fail('PHASE_INVALID')
  if(phase==='catalog-inspect' && planSha256!==undefined)fail('ARGUMENT_INVALID')
  return withContext(profilePath,async(database,state)=>{
    if(phase==='plan') {
      const plan=await readonly(database,async()=>installPlan(state,await inspect(database,state)))
      return {phase,state:plan.state,...await save(state,'install-plan',plan)}
    }
    if(phase==='install' || phase==='install-status') {
      const plan=assertLocalInstallPlan(await load(state,'install-plan',planSha256))
      assertBinding(state,plan.binding)
      await readonly(database,async()=>inspect(database,state))
      const freshRead=async()=>withContext(profilePath,async(fresh,current)=>{
        assertBinding(current,plan.binding)
        return readonly(fresh,async()=>{await inspect(fresh,current);return readLocalInstallReceipt(fresh,plan)})
      })
      const result=phase==='install-status' ? await readonly(database,async()=>{
        await inspect(database,state);return await readLocalInstallReceipt(database,plan)??{state:'NOT_INSTALLED'}
      }) : await installLocalDev127({database,plan,alignmentSql:state.alignmentSql,migrationSql:state.migrationSql,
        revalidate:async db=>{
          const current=await context(profilePath)
          assertBinding(current,state.binding)
          return installPlan(current,await inspect(db,current))
        },readAfterUnknown:freshRead})
      return {phase,state:result.state,...await save(state,'install-result',{...result,binding:state.binding})}
    }
    const currentInventory=await readonly(database,async()=>inspect(database,state))
    if(phase==='catalog-commit')assertLocalOwnerContracts(currentInventory)
    await assertDev127InstalledMigration(database)
    if(phase==='catalog-inspect') {
      const result=await inspectLocalDev127Catalog(database)
      return {phase,state:'INSPECTED',summary:result.summary,
        ...await save(state,'catalog-inspect',{binding:state.binding,...result})}
    }
    if(phase==='catalog-plan') {
      const header=await readonly(database,async()=>{
        await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        return (await database.query('SELECT publication_format FROM ai_pdm_contract.v_application_role_catalog_v3 ORDER BY display_order LIMIT 1')).rows[0]
      })
      if(header?.publication_format==='legacy-static-v1') {
        const alignment=currentInventory.ledger.find(row=>row.version===LOCAL_ALIGNMENT_VERSION)
        if(alignment?.checksum!==hash(state.alignmentSql) || !/^dev127_local_owner_alignment_[a-f0-9]{64}$/u.test(alignment?.name??'') ||
          !/^[a-f0-9]{40}$/u.test(alignment?.source_revision??''))fail('STATIC_V8_ALIGNMENT_REQUIRED')
        const ref={sha256:hash({binding:state.binding,operation:STATIC_V8_KIND})}
        const plan=await planLocalStaticV8(database,{commandId:dev127CommandId(ref),sourceRevision:state.binding.source.revision,bindingSha256:hash(state.binding)})
        return {phase,state:plan.state,diff:plan.diff,
          ...await save(state,'catalog-plan',{binding:state.binding,inventorySha256:hash(currentInventory),plan})}
      }
    } else {
      const stored=await load(state,'catalog-plan',planSha256)
      assertBinding(state,stored.binding)
      if(stored.plan?.operation===STATIC_V8_KIND) {
        assertLocalStaticV8Plan(stored.plan)
        if(stored.plan.sourceRevision!==state.binding.source.revision || stored.plan.bindingSha256!==hash(state.binding) ||
          stored.plan.migrationSha256!==hash(state.staticMigrationSql) ||
          stored.plan.commandId!==dev127CommandId({sha256:hash({binding:state.binding,operation:STATIC_V8_KIND})}))fail('STATIC_V8_PLAN_BINDING_CHANGED')
        if(stored.plan.state==='ALREADY_CURRENT') {
          const current=await planLocalStaticV8(database,{commandId:stored.plan.commandId,sourceRevision:state.binding.source.revision,bindingSha256:hash(state.binding)})
          if(current.state!=='ALREADY_CURRENT')fail('STATIC_V8_CURRENT_CHANGED')
          return {phase,state:'ALREADY_CURRENT',...await save(state,'catalog-result',{binding:state.binding,result:current})}
        }
        const freshReceipt=async()=>withContext(profilePath,async(fresh,current)=>{
          assertBinding(current,state.binding);await readonly(fresh,async()=>inspect(fresh,current));await assertDev127InstalledMigration(fresh)
          return readLocalStaticV8Receipt(fresh,stored.plan)
        })
        const result=phase==='catalog-status'
          ? {state:'READ_ONLY_COMMAND_STATUS',result:await readLocalStaticV8Receipt(database,stored.plan)}
          : await commitLocalStaticV8({database,plan:stored.plan,migrationSql:state.staticMigrationSql,
            revalidate:async db=>{
              const current=await context(profilePath);assertBinding(current,state.binding)
              const inventory=await inspect(db,current);assertLocalOwnerContracts(inventory)
              if(hash(inventory)!==stored.inventorySha256)fail('STATIC_V8_PLAN_DRIFT')
            },readAfterUnknown:freshReceipt})
        return {phase,...result,...await save(state,'catalog-result',{binding:state.binding,planSha256,result})}
      }
    }
    const releaseCapsuleRef={uri:`local:dev127/${state.binding.profileSha256}/${state.binding.source.revision}`,sha256:hash(state.binding)}
    const operation={phase:phase==='catalog-plan'?'plan':phase==='catalog-commit'?'commit':'status',
      commandId:dev127CommandId(releaseCapsuleRef),sourceRevision:state.binding.source.revision,releaseCapsuleRef,
      sourcePolicySha256:DEV127_SOURCE_POLICY_SHA256}
    let plan=null
    if(operation.phase!=='plan') {
      const stored=await load(state,'catalog-plan',planSha256)
      assertBinding(state,stored.binding);plan=stored.plan
    }
    const result=await executeDev127CatalogSql({database,operation,plan,
      readAfterUnknown:async(bound,id)=>withContext(profilePath,async(fresh,current)=>{
        assertBinding(current,state.binding)
        await readonly(fresh,async()=>inspect(fresh,current));await assertDev127InstalledMigration(fresh)
        return readDev127CommandReceipt(fresh,bound,id)
      })})
    const receipt={schemaVersion:DEV127_RECEIPT,...operation,...result}
    const stored={binding:state.binding,plan:receipt}
    return {phase,state:result.state,...await save(state,operation.phase==='plan'?'catalog-plan':'catalog-result',stored)}
  })
}
