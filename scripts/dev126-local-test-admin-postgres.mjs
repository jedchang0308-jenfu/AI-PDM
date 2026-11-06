// PDM-only SQL component proof. The caller owns provisioning and removing the
// fresh nonce database; this runner never starts a cluster or accepts primary DBs.
// node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/dev126-local-test-admin-postgres.mjs
import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { installDev127ConsumerFixture } from './lib/dev127-consumer-postgres-fixture.mjs'
import { applyRolePolicyDraftChanges } from '../src/lib/role-policy-editor.ts'

const nonce = process.env.LOCAL_TEST_ADMIN_TEST_NONCE ?? ''
const url = new URL(process.env.LOCAL_TEST_ADMIN_TEST_DATABASE_URL ?? 'invalid:')
assert.match(nonce, /^[a-f0-9]{16,32}$/u, 'fresh owner nonce required')
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol))
assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'loopback only')
assert.equal(url.pathname, '/jenfu_local_policy_' + nonce)
assert.equal(url.search, '', 'connection target overrides forbidden')
const connection = { connectionString: url.href, connectionTimeoutMillis:5000,
  statement_timeout:10000, application_name:'ai-pdm-local-admin-component' }
const client = new pg.Client(connection)
const other = new pg.Client(connection)
const sql = name => readFileSync(new URL('../db/postgres/' + name, import.meta.url), 'utf8')
const checks = []
let otherConnected = false
let taskProfileRoot
try {
  await client.connect()
  const state = (await client.query(`SELECT current_database() AS database,
    current_user=pg_get_userbyid(datdba) AS owner,
    shobj_description(oid,'pg_database') AS marker,
    host(inet_server_addr()) AS server FROM pg_database WHERE datname=current_database()`)).rows[0]
  assert.equal(state.database, 'jenfu_local_policy_' + nonce)
  assert.equal(state.owner, true, 'database owner required')
  assert.equal(state.marker, 'ai-pdm.local-test-admin-component.v1:' + nonce)
  assert.ok(['127.0.0.1', '::1'].includes(state.server))
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM pg_namespace
    WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_'`)).rows[0].count, 0,
  'preexisting schemas forbidden')
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')`)).rows[0].count, 0,
  'preexisting public objects forbidden')
  await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['local-test-admin-component:' + nonce])
  for (const role of ['jenfu_ai_pdm_migrator','jenfu_ai_pdm_runtime','jenfu_orgmaster_runtime',
    'jenfu_platform_runtime','jenfu_r1_verifier']) {
    const existing = (await client.query('SELECT * FROM pg_roles WHERE rolname=$1', [role])).rows[0]
    if (!existing) await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`)
    else assert.ok(!existing.rolsuper && !existing.rolcreatedb && !existing.rolcreaterole && !existing.rolbypassrls && !existing.rolcanlogin,
      'existing shared role is not a disposable fixture role')
  }
  // Existing helper installs only PDM tables, pure own functions and catalog views.
  const fixture = await installDev127ConsumerFixture(client, { installConsumer: false })
  await client.query(`ALTER TABLE ai_pdm_core.users ADD COLUMN display_name text, ADD COLUMN email text,
    ADD COLUMN password_hash text, ADD COLUMN role text, ADD COLUMN account_status text,
    ADD COLUMN system_role_enabled integer;
    ALTER TABLE ai_pdm_core.principal_accounts ADD COLUMN minimum_assurance text DEFAULT 'aal1';
    GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.role_policy_drafts TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.role_policy_commands TO jenfu_ai_pdm_runtime;`)
  const consumer = sql('096_dev127_platform_super_admin_consumer.sql')
  await client.query('SET ROLE jenfu_ai_pdm_migrator')
  await client.query(consumer.slice(consumer.indexOf('CREATE FUNCTION ai_pdm_core.dev127_policy_definition_v2'),
    consumer.indexOf('-- Obtain every potentially contended apply row')))
  const viewStart = consumer.indexOf('CREATE VIEW ai_pdm_contract.v_application_role_catalog_v3')
  const viewEnd = consumer.indexOf('-- Source-protected installation command:', viewStart)
  assert.ok(viewStart > 0 && viewEnd > viewStart, 'current PDM catalog view source required')
  await client.query(consumer.slice(viewStart, viewEnd))
  const upgradeStart = consumer.indexOf('CREATE FUNCTION ai_pdm_core.role_policy_upgrade_v2(')
  await client.query(consumer.slice(upgradeStart, consumer.indexOf('$upgrade$;', upgradeStart) + '$upgrade$;'.length))
  await client.query('RESET ROLE')
  const active = await fixture.upgrade()
  await client.query(sql('091_dev126_local_principal_sandbox.sql'))
  const sandbox = 'policy-' + nonce, generation = randomUUID()
  const fixtureHash = 'a'.repeat(64), fingerprint = 'b'.repeat(64)
  taskProfileRoot=mkdtempSync(join(tmpdir(),'aipdm-local-admin-component-'))
  const dataDirectory=join(taskProfileRoot,'data'), repositoryDirectory=join(taskProfileRoot,'repository')
  for(const directory of ['control','data','repository'])mkdirSync(join(taskProfileRoot,directory))
  const runtimeEndpoint=new URL(url.href)
  runtimeEndpoint.username='jenfu_ai_pdm_runtime';runtimeEndpoint.password=''
  writeFileSync(join(taskProfileRoot,'control','ai-pdm-runtime.json'),JSON.stringify({
    applicationId:'ai-pdm',sandboxId:sandbox,sandboxRoot:taskProfileRoot,dataDirectory,repositoryDirectory,
    databaseUrl:runtimeEndpoint.href
  }),{mode:0o600})
  await client.query(`INSERT INTO ai_pdm_core.local_sandbox_target_metadata
    (application_id,sandbox_id,database_name,status,generation,fixture_version,fixture_hash,
     native_session_contract_version,sandbox_root,data_directory,repository_directory,target_fingerprint)
    VALUES('ai-pdm',$1,current_database(),'ready',$2,'component-v1',$3,'jenfu.ai-pdm-session.v2',
      $5,$6,$7,$4)`, [sandbox,generation,fixtureHash,fingerprint,taskProfileRoot,dataDirectory,repositoryDirectory])
  // Database name is previously verified against a closed hex nonce, and marker
  // contents contain only the generated sandbox and UUID, never caller SQL.
  await client.query(`COMMENT ON DATABASE "jenfu_local_policy_${nonce}" IS 'jenfu.local-principal-bootstrap.v1:${sandbox}:${generation}'`)
  const install = () => new Promise((done,reject)=>{
    const child=spawn(process.execPath,['scripts/install-local-test-admin.mjs','--install'],{
      cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,env:{...process.env,
        NODE_ENV:'development',JENFU_LOCAL_SANDBOX_ROOT:taskProfileRoot,PDM_LOCAL_TEST_ADMIN_INSTALL_URL:url.href},
      stdio:['ignore','pipe','pipe']
    })
    let stdout='',stderr='',killTimer
    child.stdout.on('data',chunk=>{stdout+=chunk; if(stdout.length>65536)child.kill('SIGTERM')})
    child.stderr.on('data',chunk=>{stderr+=chunk; if(stderr.length>65536)child.kill('SIGTERM')})
    const timer=setTimeout(()=>{
      child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000)
    },20000)
    child.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error)})
    child.once('exit',(code,signal)=>{
      clearTimeout(timer);clearTimeout(killTimer)
      done({code,signal,stdout,stderr})
    })
  })
  const firstInstall=await install()
  assert.equal(firstInstall.code,0,firstInstall.stderr)
  assert.deepEqual(JSON.parse(firstInstall.stdout).migrations.map(item=>item.state),['installed','installed'])
  const secondInstall=await install()
  assert.equal(secondInstall.code,0,secondInstall.stderr)
  assert.deepEqual(JSON.parse(secondInstall.stdout).migrations.map(item=>item.state),['already_installed','already_installed'])
  const migrationPath='db/postgres/098_dev126_local_test_admin.sql'
  const receipt=(await client.query('SELECT source_sha256 FROM ai_pdm_core.local_test_admin_install_receipts WHERE migration_path=$1',[migrationPath])).rows[0]
  try {
    await client.query('UPDATE ai_pdm_core.local_test_admin_install_receipts SET source_sha256=$2 WHERE migration_path=$1',[migrationPath,'f'.repeat(64)])
    const mismatch=await install()
    assert.notEqual(mismatch.code,0)
    assert.match(mismatch.stderr,/LOCAL_TEST_ADMIN_INSTALLED_SOURCE_MISMATCH/u)
  } finally {
    await client.query('UPDATE ai_pdm_core.local_test_admin_install_receipts SET source_sha256=$2 WHERE migration_path=$1',[migrationPath,receipt.source_sha256])
  }
  assert.equal((await client.query('SELECT count(*)::int AS count FROM ai_pdm_core.local_test_admin_install_receipts')).rows[0].count,2)
  checks.push('actual-owner-cli-install-exact-source-receipts-and-idempotent-reinstall')
  const runtime = async statement => {
    await client.query('SET ROLE jenfu_ai_pdm_runtime')
    try { return await statement() } finally { await client.query('RESET ROLE') }
  }
  await runtime(() => client.query('SELECT ai_pdm_core.ensure_local_test_admin_v1($1,$2,$3,$4)',
    [sandbox,generation,fixtureHash,fingerprint]))
  const account = (await client.query(`SELECT account_type,account_status,system_role_enabled FROM ai_pdm_core.principal_accounts
    WHERE principal_id='pdm-local-test-admin'`)).rows[0]
  assert.deepEqual(account, { account_type:'human_personal',account_status:'active',system_role_enabled:true })
  assert.equal((await client.query(`SELECT count(*)::int AS count FROM pg_namespace WHERE nspname IN
    ('platform_core','platform_contract','orgmaster_core','orgmaster_contract')`)).rows[0].count, 0)
  checks.push('pdm-only-098-099-install-fixed-native-account')
  await client.query(`INSERT INTO ai_pdm_core.principal_session_records VALUES
    ('pdm-local-test-admin',repeat('c',64),0,NULL,'aal1',clock_timestamp()-interval '1 minute',
      clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',1,1)`)
  const draftId = randomUUID(), requestId = randomUUID()
  const candidate = applyRolePolicyDraftChanges({ candidate:{...fixture.upgraded,candidateCatalogVersion:'ai-pdm.role-policy.'+draftId},
    roleChanges:[],changes:[{roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'edit',enabled:false}] }).candidate
  const { contentHash: _hash,...stored } = candidate
  await runtime(() => client.query(`INSERT INTO ai_pdm_core.role_policy_drafts
    (draft_id,candidate_catalog_version,base_catalog_version,base_catalog_sha256,registry_hash,candidate_json,revision,status,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,1,'OPEN','pdm-local-test-admin','pdm-local-test-admin')`,
  [draftId,candidate.candidateCatalogVersion,active.catalogVersion,active.catalogSha256,candidate.registryHash,JSON.stringify(stored)]))
  const applySql = 'SELECT ai_pdm_core.role_policy_apply_local_test_admin_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result'
  const values = [requestId,'pdm-local-test-admin','c'.repeat(64),'urn:ai-pdm:local-test-admin',
    'pdm-local-test-admin',draftId,1,active.catalogVersion,active.catalogSha256,'本機政策測試']
  const deny = async (overrides, code) => runtime(() => assert.rejects(client.query(applySql,overrides), error => error.code===code))
  await deny([...values.slice(0,6),2,...values.slice(7)],'40001')
  await deny([...values.slice(0,8),'f'.repeat(64),values[9]],'40001')
  await deny([...values.slice(0,4),'wrong-subject',...values.slice(5)],'42501')
  const applied = (await runtime(() => client.query(applySql,values))).rows[0].result
  assert.equal(applied.status,'ACTIVE')
  assert.deepEqual((await runtime(() => client.query(applySql,values))).rows[0].result, applied)
  await deny([...values.slice(0,9),'different reason'],'23505')
  assert.equal((await client.query('SELECT status FROM ai_pdm_core.role_policy_drafts WHERE draft_id=$1',[draftId])).rows[0].status,'APPLIED')
  checks.push('native-session-policy-draft-apply-cas-replay-readback')
  for (const [change,restore] of [
    ["UPDATE ai_pdm_core.principal_session_records SET revoked_at=clock_timestamp()", "UPDATE ai_pdm_core.principal_session_records SET revoked_at=NULL"],
    ["UPDATE ai_pdm_core.principal_accounts SET account_status='suspended'", "UPDATE ai_pdm_core.principal_accounts SET account_status='active'"],
    ['UPDATE ai_pdm_core.principal_accounts SET lifecycle_version=2', 'UPDATE ai_pdm_core.principal_accounts SET lifecycle_version=1'],
    ["UPDATE ai_pdm_core.users SET account_status='suspended'", "UPDATE ai_pdm_core.users SET account_status='active'"],
    ['UPDATE ai_pdm_core.principal_session_records SET principal_auth_epoch=1','UPDATE ai_pdm_core.principal_session_records SET principal_auth_epoch=0']
  ]) {
    await client.query(change)
    await deny(values,'42501')
    await client.query(restore)
  }
  await client.query("UPDATE ai_pdm_core.principal_accounts SET account_status='suspended'")
  await runtime(() => assert.rejects(client.query('SELECT ai_pdm_core.ensure_local_test_admin_v1($1,$2,$3,$4)',
    [sandbox,generation,fixtureHash,fingerprint]), /LOCAL_TEST_ADMIN_ACCOUNT_CONFLICT/u))
  assert.equal((await client.query('SELECT account_status FROM ai_pdm_core.principal_accounts')).rows[0].account_status,'suspended',
    'quick login must not silently restore a revoked account')
  await client.query("UPDATE ai_pdm_core.principal_accounts SET account_status='active'")
  checks.push('native-account-session-revocation-denies-replay')
  await other.connect(); otherConnected=true
  await other.query('BEGIN')
  await other.query("UPDATE ai_pdm_core.local_sandbox_target_metadata SET status='maintenance'")
  const pending = runtime(() => assert.rejects(client.query(applySql,values), error => error.code==='P0002'))
  let waited=false
  for (let attempt=0;attempt<100;attempt++) {
    const row=(await other.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])).rows[0]
    if(row?.wait_event_type==='Lock'){waited=true;break}
    await new Promise(resolve => setTimeout(resolve,10))
  }
  await other.query('COMMIT')
  await pending
  assert.equal(waited,true,'local apply must wait on actual target lock')
  assert.equal((await client.query('SELECT count(*)::int AS count FROM ai_pdm_core.role_policy_commands WHERE request_id=$1',[requestId])).rows[0].count,1)
  checks.push('post-target-lock-maintenance-denies-even-replay')
  console.log(JSON.stringify({status:'PASS',checks,authority:'PDM_ONLY_LOCAL_COMPONENT',productionTouched:false,
    database:state.database,cleanup:'caller-owned fresh nonce database retained'}))
} finally {
  if(otherConnected) await other.query('ROLLBACK').catch(()=>{})
  await Promise.allSettled([client.end(),other.end()])
  if(taskProfileRoot) {
    assert.equal(resolve(dirname(taskProfileRoot)).toLowerCase(),resolve(tmpdir()).toLowerCase())
    assert.ok(basename(taskProfileRoot).startsWith('aipdm-local-admin-component-'))
    assert.equal(lstatSync(taskProfileRoot).isSymbolicLink(),false)
    assert.equal(realpathSync(taskProfileRoot).toLowerCase(),resolve(taskProfileRoot).toLowerCase())
    rmSync(taskProfileRoot,{recursive:true,force:true})
  }
}
