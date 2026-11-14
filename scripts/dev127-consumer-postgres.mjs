// Isolated SQL execution proof. Synthetic OrgMaster/Platform contracts are explicit;
// the cross-owner runner separately verifies the real producer migrations.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import pg from 'pg'
import { installDev127ConsumerFixture } from './lib/dev127-consumer-postgres-fixture.mjs'
import { upgradeRolePolicyCandidate, applyRolePolicyDraftChanges } from '../src/lib/role-policy-editor.ts'
import { readPrincipalChineseEmployeeName } from '../src/lib/principal-employee-display-name-repository.ts'
import { DEV127_RECEIPT, DEV127_SOURCE_POLICY_SHA256, dev127CommandId,
  executeDev127CatalogSql, readDev127CommandReceipt } from './lib/dev127-role-policy-upgrade.mjs'
import { assertDev127InstalledMigration } from './lib/dev127-catalog-job.mjs'

const temporary = mkdtempSync(join(tmpdir(), 'aipdm-dev127-pg-'))
const dataDir = join(temporary, 'data'), bin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin'
const exe = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
function run(name, args) {
  const result = spawnSync(exe(name), args, { encoding: 'utf8', windowsHide: true, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' })
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout}`)
}
const port = await new Promise((resolvePort, reject) => {
  const server = createServer(); server.on('error', reject)
  server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)) })
})
const options = { host: '127.0.0.1', port, database: 'postgres', user: 'postgres' }
const client = new pg.Client(options), other = new pg.Client(options)
const capsuleRef={uri:'gs://jenfu-platform-prod-aipdm-release/receipts/dev127-synthetic-capsule.json',sha256:'a'.repeat(64)}
const request = dev127CommandId(capsuleRef)
const baseVersion = 'ai-pdm.role-policy.00000000-0000-4000-8000-000000000127'
let started = false
const checks = []
async function rejected(sql, values, code) {
  await assert.rejects(client.query(sql, values), error => error.code === code)
}
try {
  console.log('DEV-127 initializing ' + temporary)
  run('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
  run('pg_ctl', ['-D', dataDir, '-l', join(temporary, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -c shared_buffers=16MB -c max_connections=12`, '-w', 'start'])
  started = true
  console.log(`DEV-127 disposable cluster started port=${port} path=${dataDir}`)
  await client.connect(); await other.connect()
  await client.query(`
    CREATE ROLE jenfu_ai_pdm_migrator; CREATE ROLE jenfu_ai_pdm_runtime; CREATE ROLE jenfu_orgmaster_migrator;
    CREATE ROLE jenfu_platform_runtime; CREATE ROLE jenfu_orgmaster_runtime; CREATE ROLE jenfu_r1_verifier;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_contract; CREATE SCHEMA platform_contract; CREATE SCHEMA dev127_fixture;
    CREATE TABLE dev127_fixture.authority(principal_id text PRIMARY KEY, employee_id text, eligible boolean, auth_epoch bigint, revoked_before timestamptz);
    INSERT INTO dev127_fixture.authority VALUES('principal-a','employee-a',true,1,NULL);
    CREATE FUNCTION orgmaster_contract.lock_ai_pdm_role_policy_authority_v2() RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT FROM dev127_fixture.authority FOR SHARE $$;
    CREATE FUNCTION orgmaster_contract.ai_pdm_role_policy_manager_eligible_v2(text,text,text,text) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT coalesce((SELECT eligible AND employee_id=$2 AND $3='issuer-a' AND $4='subject-a'
      FROM dev127_fixture.authority WHERE principal_id=$1),false) $$;
    CREATE FUNCTION platform_contract.read_principal_auth_state_v3(text)
      RETURNS TABLE(principal_id text,auth_epoch bigint,revoked_before timestamptz) LANGUAGE sql SECURITY DEFINER
      AS $$ SELECT principal_id,auth_epoch,revoked_before FROM dev127_fixture.authority WHERE principal_id=$1 $$;
    GRANT USAGE ON SCHEMA orgmaster_contract,platform_contract TO jenfu_ai_pdm_migrator,jenfu_ai_pdm_runtime;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA orgmaster_contract,platform_contract TO jenfu_ai_pdm_migrator;

  `)
  const { base } = await installDev127ConsumerFixture(client)
  checks.push('complete-096-install')
  await client.query(`CREATE TABLE ai_pdm_core.schema_migrations(version text PRIMARY KEY,name text,checksum_sha256 char(64));
    ALTER TABLE ai_pdm_core.schema_migrations OWNER TO jenfu_ai_pdm_migrator;
    INSERT INTO ai_pdm_core.schema_migrations VALUES('ai-pdm-096','dev127_platform_super_admin_consumer','36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa')`)
  await assertDev127InstalledMigration(client)
  await client.query("UPDATE ai_pdm_core.schema_migrations SET checksum_sha256=repeat('f',64)")
  await assert.rejects(assertDev127InstalledMigration(client),{code:'DEV127_INSTALLED_MIGRATION_REQUIRED'})
  await client.query("UPDATE ai_pdm_core.schema_migrations SET checksum_sha256='36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa'")
  checks.push('closed-job-actual-096-ledger-checksum-admission')
  const upgraded = upgradeRolePolicyCandidate({ ...base, candidateCatalogVersion:'ai-pdm.role-policy.'+request })
  const operation={phase:'plan',commandId:request,sourceRevision:'b'.repeat(40),releaseCapsuleRef:capsuleRef,sourcePolicySha256:DEV127_SOURCE_POLICY_SHA256}
  const planned=await executeDev127CatalogSql({database:client,operation})
  assert.deepEqual(planned.candidate,upgraded,'portable Job candidate must equal the actual owner domain core including preserved custom role')
  const plan={schemaVersion:DEV127_RECEIPT,...operation,...planned}
  let uncertainCommit=false,readbacks=0,ownerWrite=false
  const uncertain={query:async(...args)=>{
    if(args[0]==='BEGIN ISOLATION LEVEL READ COMMITTED')ownerWrite=true
    const result=await client.query(...args)
    if(args[0]==='COMMIT'&&ownerWrite&&!uncertainCommit){uncertainCommit=true;throw Object.assign(Error('connection lost after COMMIT'),{code:'ECONNRESET'})}
    return result
  }}
  const closed=await executeDev127CatalogSql({database:uncertain,operation:{...operation,phase:'commit'},plan,
    readAfterUnknown:async(bound,id)=>{readbacks++;return readDev127CommandReceipt(other,bound,id)}})
  assert.equal(closed.disposition,'UNKNOWN_COMMIT_CONFIRMED_BY_PG_RECEIPT');assert.equal(readbacks,1)
  const status=await executeDev127CatalogSql({database:client,operation:{...operation,phase:'status'},plan})
  assert.equal(status.disposition,'ORIGINAL_COMMAND_REPLAY')
  checks.push('closed-job-real-owner-candidate-plan-unknown-commit-pg-readback-status')
  const values = [request,baseVersion,base.contentHash,JSON.stringify(upgraded)]
  await client.query('SET ROLE jenfu_ai_pdm_migrator')
  const upgradeSql='SELECT ai_pdm_core.role_policy_upgrade_v2($1,$2,$3,$4::jsonb) AS result'
  const first=(await client.query(upgradeSql,values)).rows[0].result
  assert.deepEqual((await client.query(upgradeSql,values)).rows[0].result,first)
  await rejected(upgradeSql,[request,baseVersion,'f'.repeat(64),JSON.stringify(upgraded)],'23505')
  checks.push('owner-additive-upgrade-cas-replay')
  await client.query('RESET ROLE')
  const preservation=(await client.query(`SELECT stable_role_id,permissions,role_status FROM ai_pdm_core.role_catalog_entries WHERE catalog_version=$1 ORDER BY display_order`,[first.catalogVersion])).rows
  assert.deepEqual(preservation.slice(0,-1),base.roles.map(role=>({stable_role_id:role.stableRoleId,permissions:role.permissions,role_status:role.roleStatus})))
  checks.push('ten-old-identities-and-permissions-preserved')
  const acl=(await client.query(`SELECT has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text)','EXECUTE') AS old_apply,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_lock_apply_v1(uuid,uuid,text,text)','EXECUTE') AS old_lock,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_upgrade_v2(uuid,text,char,jsonb)','EXECUTE') AS owner_upgrade,
    has_function_privilege('jenfu_ai_pdm_runtime','ai_pdm_core.role_policy_apply_v2(uuid,text,text,text,text,uuid,integer,text,char,text)','EXECUTE') AS new_apply`)).rows[0]
  assert.deepEqual(acl,{old_apply:false,old_lock:false,owner_upgrade:false,new_apply:true})
  const producerRead=(await client.query(`SELECT
    has_table_privilege('jenfu_orgmaster_migrator','ai_pdm_contract.v_application_role_catalog_v3','SELECT') AS current,
    has_table_privilege('jenfu_orgmaster_migrator','ai_pdm_contract.v_role_policy_publications_v1','SELECT') AS history,
    has_table_privilege('jenfu_orgmaster_migrator','ai_pdm_core.principal_accounts','SELECT') AS core`)).rows[0]
  assert.deepEqual(producerRead,{current:true,history:true,core:false})
  checks.push('actual-runtime-function-acl')
  await client.query(`INSERT INTO ai_pdm_core.users VALUES('profile-a','company-a');
    INSERT INTO ai_pdm_core.principal_accounts VALUES('principal-a','employee-a','profile-a','company-a','active',true,'human_personal',1,1,NULL);
    INSERT INTO ai_pdm_core.principal_session_records VALUES('principal-a',repeat('a',64),1,NULL,'aal1',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',1,1);`)
  const draft='20000000-0000-4000-8000-000000000127', command='30000000-0000-4000-8000-000000000127'
  const edit=applyRolePolicyDraftChanges({candidate:{...upgraded,candidateCatalogVersion:'ai-pdm.role-policy.'+draft},roleChanges:[],changes:[{roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'edit',enabled:false}]}).candidate
  const {contentHash,...stored}=edit
  await client.query(`INSERT INTO ai_pdm_core.role_policy_drafts(draft_id,candidate_catalog_version,base_catalog_version,base_catalog_sha256,registry_hash,candidate_json,revision,status,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,1,'OPEN','principal-a','principal-a')`,[draft,edit.candidateCatalogVersion,first.catalogVersion,first.catalogSha256,edit.registryHash,JSON.stringify(stored)])
  const applySql='SELECT ai_pdm_core.role_policy_apply_v2($1,$2,$3,$4,$5,$6,1,$7,$8,$9) AS result'
  const applyValues=[command,'principal-a','a'.repeat(64),'issuer-a','subject-a',draft,first.catalogVersion,first.catalogSha256,'測試管理政策']
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  await rejected(applySql,[...applyValues.slice(0,2),'b'.repeat(64),...applyValues.slice(3)],'42501')
  await rejected(applySql,[...applyValues.slice(0,4),'other-subject',...applyValues.slice(5)],'42501')
  await client.query('RESET ROLE')
  await client.query(`UPDATE dev127_fixture.authority SET eligible=false`)
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  await rejected(applySql,applyValues,'42501')
  await client.query('RESET ROLE')
  await client.query(`UPDATE dev127_fixture.authority SET eligible=true`)
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  const applied=(await client.query(applySql,applyValues)).rows[0].result
  assert.equal(applied.status,'ACTIVE')
  assert.deepEqual((await client.query(applySql,applyValues)).rows[0].result,applied)
  checks.push('personal-aal1-apply-and-current-identity-denials')
  await client.query('RESET ROLE')
  await client.query(`UPDATE ai_pdm_core.principal_session_records SET assurance_level='aal2'`)
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  assert.deepEqual((await client.query(applySql,applyValues)).rows[0].result,applied)
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  await rejected(applySql,applyValues,'25001')
  await client.query('ROLLBACK; RESET ROLE')
  for (const [change,restore] of [
    ["UPDATE ai_pdm_core.principal_session_records SET revoked_at=clock_timestamp()", "UPDATE ai_pdm_core.principal_session_records SET revoked_at=NULL"],
    ["UPDATE dev127_fixture.authority SET auth_epoch=2", "UPDATE dev127_fixture.authority SET auth_epoch=1"],
    ["UPDATE ai_pdm_core.principal_accounts SET account_type='agent'", "UPDATE ai_pdm_core.principal_accounts SET account_type='human_personal'"]
  ]) {
    await client.query(change); await client.query('SET ROLE jenfu_ai_pdm_runtime')
    await rejected(applySql,applyValues,'42501')
    await client.query('RESET ROLE'); await client.query(restore)
  }
  checks.push('aal2-replay-and-revoked-session-epoch-workload-isolation-denials')
  // Revocation commits while apply waits on the authority fence. The next
  // statement snapshot must see the revocation and deny before publishing.
  await other.query('BEGIN'); await other.query(`UPDATE dev127_fixture.authority SET eligible=false`)
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  const waiting=client.query(applySql,applyValues)
  const denial=assert.rejects(waiting,error=>error.code==='42501')
  let observedLockWait=false
  for(let attempt=0;attempt<100;attempt++) {
    const {rows:[state]}=await other.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])
    if(state?.wait_event_type==='Lock') { observedLockWait=true; break }
    await new Promise(resolveWait=>setTimeout(resolveWait,10))
  }
  assert.equal(observedLockWait,true,'apply must actually wait on the producer authority fence')
  await other.query('COMMIT'); await denial
  checks.push('post-authority-lock-revocation-denies-even-replay')
  await client.query('RESET ROLE; BEGIN READ ONLY')
  const displayClient={kind:'postgres',transactionScope:'postgres',async query(sql,params){
    const values=params?[params.principalId,params.employeeId]:[]
    return (await client.query(sql.replace(':principalId','$1').replace(':employeeId','$2'),values)).rows
  }}
  assert.equal(await readPrincipalChineseEmployeeName(displayClient,'principal-a','employee-a'),null)
  assert.equal((await client.query('SELECT 1 AS authenticated_snapshot_still_usable')).rows[0].authenticated_snapshot_still_usable,1)
  await client.query('COMMIT')
  checks.push('optional-display-view-failure-preserves-real-readonly-principal-transaction')
  await client.query(`ALTER TABLE ai_pdm_core.principal_session_records ADD COLUMN revoke_reason text;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.role_priority_versions (status text,priority_json text);
    RESET ROLE;`);
  await client.query(readFileSync('db/postgres/104_dev121_principal_session_revocation.sql','utf8'))
  await client.query(readFileSync('db/postgres/106_dev121_reviewer_authority.sql','utf8'))
  await client.query(`
    CREATE FUNCTION orgmaster_contract.read_ai_pdm_session_authority_v1(text,text)
    RETURNS TABLE(contract_version text,source_version text,evaluated_at timestamptz,next_boundary timestamptz,accounts jsonb,grants jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER AS $source$
      SELECT 'orgmaster.ai-pdm-session-authority.v1','1',transaction_timestamp(),NULL::timestamptz,
        jsonb_build_array(jsonb_build_object('contract_version','organization.active-principal.v1',
          'principal_id',$1,'employee_id',$2,'principal_issuer','issuer-a','principal_subject','subject-a',
          'employee_status','active','account_type','human_personal')),
        jsonb_build_array(jsonb_build_object('contract_version','jenfu.orgmaster.ai-pdm-principal-grants.v6',
          'application_id','ai-pdm','principal_id',$1,'employee_id',$2,'grant_kind','direct','subject_kind','principal',
          'target_principal_id',$1,'scope_kind','global','valid_from',transaction_timestamp()-interval '1 day',
          'stable_role_id','role-application-system-admin','role_code','application_system_admin','source_grant_id','grant-a'))
      WHERE $1='principal-a' AND $2='employee-a'
    $source$;
    GRANT SELECT,INSERT ON ai_pdm_core.principal_session_records TO jenfu_ai_pdm_runtime;`)
  await client.query(readFileSync('db/postgres/105_dev121_role_policy_session_guard.sql','utf8'))
  const managerSql = 'SELECT ai_pdm_core.require_role_policy_session_manager_v1($1,$2,$3,$4)'
  const snapshotApplySql = applySql.replace('role_policy_apply_v2','role_policy_apply_snapshot_v1')
  const managerValues = ['principal-a','c'.repeat(64),'issuer-a','subject-a']
  const snapshotVersion = applied.catalogVersion
  const snapshot = JSON.stringify({version:1,catalogVersion:snapshotVersion,canManageRolePolicy:true})
  const insertSession = (hash, seconds) => client.query(`INSERT INTO ai_pdm_core.principal_session_records
    (principal_id,session_id_hash,principal_auth_epoch,revoked_at,assurance_level,issued_at,authenticated_at,
      expires_at,lifecycle_version,profile_version,permission_snapshot)
    VALUES('principal-a',$1,1,NULL,'aal1',clock_timestamp()-interval '1 minute',
      clock_timestamp()-interval '1 minute',clock_timestamp()+$2::integer*interval '1 second',1,1,$3)`, [hash,seconds,snapshot])
  const issuerSql = 'SELECT * FROM ai_pdm_core.read_principal_session_authority_v2($1,$2,$3,$4,$5)'
  const issueSession = async (hash, seconds) => {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await client.query(issuerSql,['principal-a','employee-a','issuer-a','subject-a',hash])
    await insertSession(hash,seconds)
    await client.query('COMMIT')
  }
  await client.query('SET ROLE jenfu_ai_pdm_runtime')
  await insertSession('d'.repeat(64),60)
  await rejected(managerSql,['principal-a','d'.repeat(64),'issuer-a','subject-a'],'42501')
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  await client.query(issuerSql,['principal-a','employee-a','issuer-a','subject-a','d'.repeat(64)])
  await client.query('COMMIT')
  await rejected(managerSql,['principal-a','d'.repeat(64),'issuer-a','subject-a'],'42501')
  await issueSession(managerValues[1],60)
  await rejected(managerSql,[...managerValues.slice(0,3),'other-subject'],'42501')
  await client.query(managerSql,managerValues)
  const snapshotReplay = [command,'principal-a',managerValues[1],'issuer-a','subject-a',
    draft,first.catalogVersion,first.catalogSha256,'測試管理政策']
  assert.deepEqual((await client.query(snapshotApplySql,snapshotReplay)).rows[0].result,applied)
  checks.push('snapshot-native-replay-without-upstream-and-forged-session-denials')

  const proveDeniedAfterWait = async ({hash,revoke}) => {
    await other.query('BEGIN')
    if (revoke) await other.query('UPDATE ai_pdm_core.principal_session_records SET revoked_at=clock_timestamp() WHERE session_id_hash=$1',[hash])
    else await other.query("SELECT 1 FROM ai_pdm_core.active_role_catalog WHERE application_id='ai-pdm' FOR UPDATE")
    const blocked = assert.rejects(client.query(snapshotApplySql,
      [snapshotReplay[0],snapshotReplay[1],hash,...snapshotReplay.slice(3)]), {code:'42501'})
    let observed = false
    for (let attempt=0;attempt<100;attempt++) {
      const {rows:[state]}=await other.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])
      if (state?.wait_event_type==='Lock') { observed=true; break }
      await new Promise(resolveWait=>setTimeout(resolveWait,10))
    }
    assert.equal(observed,true,'snapshot apply must actually wait')
    if (!revoke) await other.query('SELECT pg_sleep(2)')
    await other.query('COMMIT')
    await blocked
  }
  await proveDeniedAfterWait({hash:managerValues[1],revoke:true})
  const expiringHash='e'.repeat(64)
  await issueSession(expiringHash,2)
  await proveDeniedAfterWait({hash:expiringHash,revoke:false})
  checks.push('snapshot-revocation-and-expiry-while-native-apply-waits')
  const reviewer = 'reviewer-with-no-session'
  await other.query('INSERT INTO ai_pdm_core.reviewer_authority VALUES($1,1,NULL)',[reviewer])
  const candidate = 'SELECT principal_id FROM ai_pdm_core.reviewer_authority WHERE principal_id=$1 AND pending_operation_id IS NULL'
  const prepareReviewer = async () => other.query(
    "SELECT ai_pdm_core.apply_principal_session_revocation_v1($1,$2,'prepare',$3,$4,ARRAY[$5],NULL,NULL,1,2)",
    [randomUUID(),randomUUID(),'a'.repeat(64),'b'.repeat(64),reviewer])
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  assert.equal((await client.query(candidate,[reviewer])).rowCount,1)
  await other.query('BEGIN')
  await prepareReviewer()
  await other.query('SET CONSTRAINTS ALL IMMEDIATE')
  const stale = assert.rejects(client.query(candidate+' FOR SHARE',[reviewer]),{code:'40001'})
  for (let attempt=0;attempt<100;attempt++) {
    const {rows:[state]}=await other.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])
    if (state?.wait_event_type==='Lock') break
    if (attempt===99) assert.fail('old reviewer snapshot must wait for prepare')
    await new Promise(resolveWait=>setTimeout(resolveWait,10))
  }
  await other.query('COMMIT')
  await stale
  await client.query('ROLLBACK')
  assert.equal((await client.query(candidate,[reviewer])).rowCount,0)
  checks.push('prepare-fences-selected-offline-reviewer-in-old-repeatable-read')
  console.log(JSON.stringify({status:'PASS',checks,producer:'SYNTHETIC_CONTRACT',persistentDatabasesTouched:false}))
} finally {
  if (client._connected) await client.end().catch(()=>{}); if (other._connected) await other.end().catch(()=>{})
  if(started) run('pg_ctl',['-D',dataDir,'-m','immediate','-w','stop'])
  const actual=realpathSync(temporary), expected=resolve(tmpdir())+sep
  if(!actual.startsWith(expected) || !actual.includes('aipdm-dev127-pg-')) throw new Error('TEMP_CLEANUP_BOUNDARY')
  rmSync(actual,{recursive:true,force:true})
  console.log(`DEV-127 disposable cluster stopped and removed port=${port}`)
}
