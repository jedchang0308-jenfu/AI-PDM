import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const commonGit=execFileSync('git',['-C',root,'rev-parse','--path-format=absolute','--git-common-dir'],
  {encoding:'utf8',windowsHide:true}).trim()
const platform=await realpath(path.resolve(commonGit,'..','..','Jenfu-Platform'))
const bindingPath=path.join(platform,'.dev-local-daily.local.json')
const markerName='shared-daily-system-test-admin.json'
const expected={format:'ai-pdm.shared-daily-system-test-admin.v1',sandboxId:'shared-daily',databaseName:'jenfu_local_shared_daily',
  principalId:'local-active',employeeId:'employee-local-active',roleCode:'system_admin',expectedPermissionCount:66}
const fail=code=>{throw Object.assign(new Error(code),{code})}
const samePath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b)

async function json(filename,maximum=128*1024){
  const stat=await lstat(filename)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>maximum||!samePath(await realpath(filename),filename))fail('SHARED_DAILY_PROFILE_INVALID')
  try{return JSON.parse(await readFile(filename,'utf8'))}catch{fail('SHARED_DAILY_PROFILE_INVALID')}
}

const [mode,...extra]=process.argv.slice(2)
if(!['--enable','--status','--verify'].includes(mode)||extra.length)fail('SHARED_DAILY_ARGUMENT_INVALID')
const binding=await json(bindingPath,16*1024)
if(binding.format!=='jenfu.dev-local-daily.v1'||typeof binding.profileRoot!=='string'||!path.isAbsolute(binding.profileRoot)||
  path.basename(path.dirname(binding.profileRoot))!=='jenfu-shared-daily'||path.basename(binding.profileRoot)!=='profile')fail('SHARED_DAILY_BINDING_INVALID')
const profileRoot=await realpath(binding.profileRoot),control=path.join(profileRoot,'control')
if(!samePath(await realpath(control),control))fail('SHARED_DAILY_PROFILE_INVALID')
const runtime=await json(path.join(control,'ai-pdm-runtime.json'))
if(runtime.applicationId!=='ai-pdm'||runtime.sandboxId!=='shared-daily'||!samePath(runtime.sandboxRoot,profileRoot)||
  runtime.runtimeRole!=='local_pdm_runtime_d126_20261029'||runtime.origin!=='http://localhost:1020')fail('SHARED_DAILY_RUNTIME_INVALID')
let database
try{database=new URL(runtime.databaseUrl)}catch{fail('SHARED_DAILY_RUNTIME_INVALID')}
if(!['postgres:','postgresql:'].includes(database.protocol)||!['127.0.0.1','[::1]','localhost'].includes(database.hostname)||
  decodeURIComponent(database.pathname.slice(1))!==expected.databaseName||decodeURIComponent(database.username)!==runtime.runtimeRole||database.hash)fail('SHARED_DAILY_RUNTIME_INVALID')
const client=new pg.Client({connectionString:database.href,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,
  application_name:'ai-pdm-shared-daily-system-test-admin'})
let row,session
try{
  await client.connect()
  row=(await client.query(`SELECT current_database() database_name,current_user runtime_role,sandbox_id,generation::text,fixture_hash,target_fingerprint,status
    FROM ai_pdm_core.local_sandbox_target_metadata WHERE application_id='ai-pdm' AND sandbox_id='shared-daily'`)).rows
  if(row.length!==1)fail('SHARED_DAILY_TARGET_INVALID')
  row=row[0]
  const account=(await client.query(`SELECT principal_id,employee_id,account_type,account_status FROM ai_pdm_core.principal_accounts
    WHERE principal_id='local-active'`)).rows
  if(account.length!==1||account[0].employee_id!==expected.employeeId||account[0].account_type!=='human_personal'||account[0].account_status!=='active')fail('SHARED_DAILY_PRINCIPAL_INVALID')
  if(mode==='--verify'){
    session=(await client.query(`SELECT issued_at,permission_snapshot FROM ai_pdm_core.principal_session_records
      WHERE principal_id='local-active' AND revoked_at IS NULL AND expires_at>clock_timestamp() AND permission_snapshot IS NOT NULL
      ORDER BY issued_at DESC LIMIT 1`)).rows[0]
  }
}finally{await client.end().catch(()=>undefined)}
if(row.database_name!==expected.databaseName||row.runtime_role!==runtime.runtimeRole||row.sandbox_id!==expected.sandboxId||
  row.status!=='ready'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(row.generation)||
  !/^[a-f0-9]{64}$/u.test(row.fixture_hash)||!/^[a-f0-9]{64}$/u.test(row.target_fingerprint))fail('SHARED_DAILY_TARGET_INVALID')
const marker={...expected,generation:row.generation,fixtureHash:row.fixture_hash,targetFingerprint:row.target_fingerprint,createdAt:new Date().toISOString()}
const filename=path.join(control,markerName)
if(mode==='--status'||mode==='--verify'){
  const current=await json(filename,16*1024).catch(error=>error.code==='ENOENT'?null:Promise.reject(error))
  const enabled=current&&JSON.stringify({...current,createdAt:marker.createdAt})===JSON.stringify(marker)
  if(mode==='--verify'){
    if(!enabled||!session||Date.parse(session.issued_at)<Date.parse(current.createdAt))fail('SHARED_DAILY_FRESH_SESSION_REQUIRED')
    const snapshot=session.permission_snapshot
    const permissions=snapshot?.permissions
    if(snapshot?.version!==1||snapshot?.canManageRolePolicy!==true||!permissions||typeof permissions!=='object')fail('SHARED_DAILY_PERMISSION_SNAPSHOT_INVALID')
    const allowed=Object.entries(permissions).filter(([key,candidates])=>!/:\d+$/u.test(key)&&Array.isArray(candidates)&&
      candidates.some(candidate=>Array.isArray(candidate)&&candidate[1]===true&&candidate[2]===expected.roleCode&&candidate[3]==='shared-daily-system-test-admin')).map(([key])=>key).sort()
    const required=['action:handoff.published.view','page:numbering.tasks']
    if(allowed.length!==expected.expectedPermissionCount||required.some(key=>!allowed.includes(key)))fail('SHARED_DAILY_PERMISSION_COUNT_INVALID')
    process.stdout.write(JSON.stringify({status:'VERIFIED',sandboxId:expected.sandboxId,principalId:expected.principalId,
      databaseName:expected.databaseName,permissionCount:allowed.length,expectedPermissionCount:expected.expectedPermissionCount,
      requiredPermissions:required,canManageRolePolicy:true})+'\n')
  }else process.stdout.write(JSON.stringify({status:enabled?'ENABLED':'DISABLED_OR_STALE',sandboxId:expected.sandboxId,
    principalId:expected.principalId,databaseName:expected.databaseName,expectedPermissionCount:66})+'\n')
}else{
  const temporary=`${filename}.${process.pid}.${randomUUID()}.tmp`
  try{await writeFile(temporary,JSON.stringify(marker,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,filename)}
  finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error})}
  process.stdout.write(JSON.stringify({status:'ENABLED',sandboxId:marker.sandboxId,principalId:marker.principalId,
    databaseName:marker.databaseName,expectedPermissionCount:marker.expectedPermissionCount})+'\n')
}
