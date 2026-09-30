import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { deriveAiPdmMigration } from './dev010-n1c-ai-pdm-package.mjs';
import { readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parent = process.env.DEV057_FILE_QC_ROOT;
const dsn = process.env.DEV057_NUMBERING_ADMIN_URL;
if (!parent || !dsn) throw new Error('DEV057_NUMBERING_OWNER_FIXTURE_REQUIRED');
const taskRoot = path.resolve(parent);
assert.equal(path.dirname(taskRoot), path.resolve(os.tmpdir()));
assert.ok(path.basename(taskRoot).startsWith('orgmaster-dev057-qc-'));
const original = new URL(dsn);
assert.equal(original.hostname, '127.0.0.1');
assert.match(original.pathname, /^\/dev057_[a-f0-9]{16}$/u);
assert.equal(original.username, 'postgres');
const cluster = path.join(taskRoot, 'cluster');
const major = fs.readFileSync(path.join(cluster, 'PG_VERSION'), 'utf8').trim();
assert.ok(['17','18'].includes(major));
const bin = path.join('C:/Program Files/PostgreSQL', major, 'bin');
const name = 'dev121_numbering_' + crypto.randomBytes(8).toString('hex');
const dump = path.join(taskRoot, name + '.backup');
const admin = new pg.Client({ connectionString: dsn });
let target, created = false, dropped = false;
const migrations = [];
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90000, ...options });
  if (result.status !== 0) throw new Error('DEV121_NUMBERING_FIXTURE_PROCESS_FAILED:' + (result.stderr || result.stdout || result.error?.message));
  return result;
};
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
try {
  await admin.connect();
  assert.equal(path.resolve((await admin.query('SHOW data_directory')).rows[0].data_directory), cluster);
  run(path.join(bin,'pg_dump.exe'), ['--format=custom','--file',dump,'--schema=orgmaster','--schema=access_governance','--schema=orgmaster_core','--schema=orgmaster_contract','--dbname',dsn]);
  await admin.query('CREATE DATABASE ' + name);
  created = true;
  const ownerUrl = new URL(dsn); ownerUrl.pathname = '/' + name;
  target = new pg.Client({ connectionString: ownerUrl.toString() });
  await target.connect();
  const extension = await admin.query("SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'");
  assert.equal(extension.rows[0]?.schema, 'public', 'the task-owned producer requires the native pgcrypto bootstrap');
  // Neutral disposable database bootstrap, matching the producer cluster; not application-owned DDL.
  await target.query('CREATE EXTENSION pgcrypto WITH SCHEMA public');
  await target.query('CREATE SCHEMA ai_pdm_legacy_stage AUTHORIZATION jenfu_ai_pdm_migrator; CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator; CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;');
  const profile = JSON.parse(fs.readFileSync(path.join(root,'config/release/dev117-ai-pdm-independent-production-v3.json'),'utf8'));
  const apply = async entry => {
    const source = fs.readFileSync(path.join(root,entry.path),'utf8').replaceAll('\r\n','\n');
    assert.equal(hash(source), entry.sha256, 'canonical source bytes must match the existing owner profile');
    const compiled = deriveAiPdmMigration(entry.path, source);
    await target.query('BEGIN');
    try { await target.query('SET LOCAL ROLE jenfu_ai_pdm_migrator'); await target.query(compiled.output); await target.query('COMMIT'); }
    catch (error) { await target.query('ROLLBACK'); throw Object.assign(error, { fixtureMigration: entry.path }); }
    migrations.push({ path: entry.path, sourceSha256: entry.sha256, compiledSha256: hash(compiled.output) });
  };
  for (const entry of profile.migrations.entries.slice(0, profile.migrations.baselineCount)) await apply(entry);
  run(path.join(bin,'pg_restore.exe'), ['--exit-on-error','--dbname',ownerUrl.toString(),dump]);
  // The production v3 data prerequisite is reproduced only in this disposable database.
  const v3 = await readRoleCatalog(path.join(root,'config/access-control/jenfu-role-catalog.v1.json'));
  await target.query(`INSERT INTO ai_pdm_core.role_catalog_publications
    (catalog_version,contract_version,application_id,published_at,catalog_sha256,status,published_by)
    VALUES ($1,$2,$3,$4,$5,'active','task-owned DEV121 fixture')`,
    [v3.catalogVersion,v3.contractVersion,v3.applicationId,v3.publishedAt,v3.catalogSha256]);
  for (const [order,role] of v3.roles.entries()) {
    await target.query(`INSERT INTO ai_pdm_core.role_catalog_entries
      (catalog_version,display_order,stable_role_id,role_code,display_name,
       assignable,risk,subject_kind,recommendation_allowed,delegation_allowed,
       allowed_scope_kinds,assignment_tier,permissions,metadata,role_definition_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15)`,
      [v3.catalogVersion,order,role.stableRoleId,role.roleCode,role.displayName,
       role.assignable,role.risk,role.subjectKind,role.recommendationAllowed,
       role.delegationAllowed,JSON.stringify(role.allowedScopeKinds),role.assignmentTier,
       JSON.stringify(role.permissions),JSON.stringify(role.metadata ?? null),role.roleDefinitionHash]);
  }
  await target.query(`INSERT INTO ai_pdm_core.active_role_catalog
    (application_id,catalog_version,activated_at,activated_by,activation_reason)
    VALUES ('ai-pdm',$1,now(),'task-owned DEV121 fixture','exact approved v3 prerequisite')`,[v3.catalogVersion]);
  for (const entry of profile.migrations.entries.slice(profile.migrations.baselineCount)) await apply(entry);
  assert.ok([undefined,'direct','delegated'].includes(process.env.DEV057_NUMBERING_ACTOR));
  const delegated=process.env.DEV057_NUMBERING_ACTOR==='delegated';
  const principal=delegated?process.env.DEV057_NUMBERING_DELEGATE_PRINCIPAL_ID:'principal-legacy';
  const employee=delegated?process.env.DEV057_NUMBERING_DELEGATE_EMPLOYEE_ID:'employee-legacy';
  assert.ok(principal && employee && (!delegated || (process.env.DEV057_NUMBERING_DELEGATE_ISSUER && process.env.DEV057_NUMBERING_DELEGATE_SUBJECT)),
    'delegated probe requires the producer-verified exact account tuple');
  // Create the immutable profile link correctly at first insertion. Never
  // delete/rebind an admitted account, even in this disposable fixture.
  await target.query(`INSERT INTO ai_pdm_core.companies (id,company_code,company_kind,display_name)
    VALUES ('company-jenfu','JENFU','business','Synthetic Jenfu'),('company-other','MAXIMA','business','Synthetic other');
    INSERT INTO ai_pdm_core.users (id,display_name,role,company_id) VALUES ('qc-profile-legacy','Synthetic profile','Engineer','company-jenfu');
    INSERT INTO ai_pdm_core.role_priority_versions (id,version_code,priority_json)
    VALUES ('qc-priority','qc-priority','["system_admin","pdm_admin","rd_manager","qa","rd","manufacturing","procurement","external_specialist"]');`);
  await target.query(`INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
       lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
    VALUES ($1,'qc-profile-legacy','company-jenfu',$2,'human_personal','active',1,1,true,'aal1')`,[principal,employee]);
  const review = process.env.DEV057_NATIVE_REVIEW_PROBE === '1';
  if (review) {
    const owner = process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID;
    assert.match(owner ?? '', /^principal-/u);
    await target.query(`INSERT INTO ai_pdm_core.users (id,display_name,role,company_id)
      VALUES ('qc-profile-owner','Synthetic owner','Engineer','company-jenfu');
      UPDATE ai_pdm_core.pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit='local-dev',schema_hash='dev090-v1';`);
    await target.query(`INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
       lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
      VALUES ($1,'qc-profile-owner','company-jenfu','employee-three','human_personal','active',1,1,true,'aal1')`,[owner]);
  }
  const consumer = new URL(ownerUrl); consumer.username = 'dev057_ai_pdm_consumer_probe';
  const result = run(process.execPath, [path.join(root,'node_modules/vitest/vitest.mjs'),'run',
    review ? 'src/lib/principal-work-review-owner-grant.postgres-contract.test.ts' : 'src/lib/principal-numbering-owner-grant.postgres-contract.test.ts'], {
    env: { ...process.env, CI:'1', DEV121_NUMBERING_POSTGRES_URL: consumer.toString(),
      PDM_POSTGRES_URL: consumer.toString(), PDM_DB_PROVIDER:'postgres', DEV010_N2_DATABASE_BOUNDARY:'required',
      PDM_DATA_DIR:path.join(taskRoot,'aipdm-numbering-data'), PDM_REPOSITORY_DIR:path.join(taskRoot,'aipdm-numbering-repository'),
      PDM_PRODUCTION_SLICE_MODE:'official-numbering-draft', PDM_NUMBER_STATE_FLOW_V1:'1',
      PDM_AUTH_MODE:'firebase_bff',PDM_JENFU_PLATFORM_AUTH_MODE:'on',PDM_JENFU_ENTITLEMENT_MODE:'enforce',
      JENFU_FIREBASE_PROJECT_ID:'dev057-synthetic',PDM_FIREBASE_PROJECT_ID:'dev057-synthetic',
      JENFU_IDENTITY_AUDIENCE:'dev057-synthetic',JENFU_IDENTITY_ISSUER:'https://securetoken.google.com/dev057-synthetic',
      PDM_SESSION_ISSUER:'https://ai-pdm.test',PDM_SESSION_AUDIENCE:'dev057-numbering-qc',
      PDM_SESSION_CURRENT_KEY_ID:'dev057-qc-key',PDM_SESSION_CURRENT_SECRET:'task-owned-synthetic-session-secret-for-local-qc-only' }
  });
  assert.match(result.stdout, review ? /Tests\s+2 passed/u : /Tests\s+8 passed/u, 'the selected actual business flow must execute, not skip');
  console.log(JSON.stringify({ status:'PASS', phase:process.env.DEV057_CONTRACT_PHASE, migrations,
    producer:'actual OrgMaster schema and published artifact snapshot from the parent isolated cluster',
    session:'synthetic verified-session input; no provider evidence', productionWrites:false }));
} finally {
  await target?.end();
  if (created) { await admin.query('DROP DATABASE ' + name); dropped = true; }
  await admin.end();
  if (fs.existsSync(dump)) fs.unlinkSync(dump);
  if (created && !dropped) throw new Error('DEV121_NUMBERING_DATABASE_CLEANUP_FAILED');
}
