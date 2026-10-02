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
  const nativeTransfer = process.env.DEV057_NATIVE_TRANSFER_PROBE === '1';
  const review = process.env.DEV057_NATIVE_REVIEW_PROBE === '1';
  assert.ok(!(nativeTransfer && review), 'review and transfer consumer probes are separate');
  assert.ok([undefined,'direct','delegated'].includes(process.env.DEV057_NUMBERING_ACTOR));
  const delegated=process.env.DEV057_NUMBERING_ACTOR==='delegated';
  const actorTuple = nativeTransfer ? {
    principalId: process.env.DEV057_NUMBERING_PRINCIPAL_ID,
    employeeId: process.env.DEV057_NUMBERING_EMPLOYEE_ID,
    accountType: process.env.DEV057_NUMBERING_ACCOUNT_TYPE,
    issuer: process.env.DEV057_NUMBERING_ISSUER,
    subject: process.env.DEV057_NUMBERING_SUBJECT
  } : {
    principalId: delegated?process.env.DEV057_NUMBERING_DELEGATE_PRINCIPAL_ID:'principal-legacy',
    employeeId: delegated?process.env.DEV057_NUMBERING_DELEGATE_EMPLOYEE_ID:'employee-legacy',
    accountType: 'human_personal',
    issuer: delegated?process.env.DEV057_NUMBERING_DELEGATE_ISSUER:'issuer-legacy',
    subject: delegated?process.env.DEV057_NUMBERING_DELEGATE_SUBJECT:'subject-legacy'
  };
  const { principalId: principal, employeeId: employee, accountType } = actorTuple;
  assert.ok(principal && employee && actorTuple.issuer && actorTuple.subject &&
    (!nativeTransfer || ['human_personal','human_privileged'].includes(accountType)),
    nativeTransfer
      ? 'transfer probe requires all five exact producer-readback reviewer fields and a supported account type'
      : 'delegated probe requires the producer-verified exact account tuple');
  const ownerTuple = nativeTransfer ? {
    principalId: process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID,
    employeeId: process.env.DEV057_FLOW_OWNER_EMPLOYEE_ID,
    accountType: process.env.DEV057_FLOW_OWNER_ACCOUNT_TYPE,
    issuer: process.env.DEV057_FLOW_OWNER_ISSUER,
    subject: process.env.DEV057_FLOW_OWNER_SUBJECT
  } : null;
  if (nativeTransfer) {
    assert.ok(ownerTuple?.principalId && ownerTuple.employeeId && ownerTuple.accountType &&
      ownerTuple.issuer && ownerTuple.subject,
    'transfer probe requires the exact producer-readback owner tuple');
    const assertTypedTuple = async (tuple, label) => {
      const rows = await target.query(`SELECT contract_version,principal_id,employee_id,account_type,
          principal_issuer,principal_subject,employee_status
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id=$1 AND employee_id=$2`, [tuple.principalId,tuple.employeeId]);
      assert.ok(rows.rowCount >= 1 && rows.rowCount <= 2,
        'the consumer contract permits only one or two active aliases per ' + label);
      assert.ok(rows.rows.some((row) => row.contract_version === 'organization.active-principal.v1' &&
        row.principal_id === tuple.principalId && row.employee_id === tuple.employeeId &&
        row.account_type === tuple.accountType && row.principal_issuer === tuple.issuer &&
        row.principal_subject === tuple.subject && row.employee_status === 'active'),
      'the exact ' + label + ' tuple must be present in the real active typed-account producer');
      assert.ok(rows.rows.every((row) => row.contract_version === 'organization.active-principal.v1' &&
        row.employee_id === tuple.employeeId && row.account_type === tuple.accountType &&
        row.employee_status === 'active'),
      'typed aliases for ' + label + ' must retain one exact active Employee/account type');
    };
    await assertTypedTuple(actorTuple, 'transfer reviewer');
    await assertTypedTuple(ownerTuple, 'transfer owner');
  }
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
    VALUES ($1,'qc-profile-legacy','company-jenfu',$2,$3,'active',1,1,true,'aal1')`,
  [principal,employee,accountType]);
  if (nativeTransfer) {
    await target.query(`INSERT INTO ai_pdm_core.users (id,display_name,role,company_id)
      VALUES ('qc-profile-owner','Synthetic transfer owner','Engineer','company-jenfu'),
             ('qc-profile-other','Synthetic other-company owner','Engineer','company-other')
      ON CONFLICT (id) DO NOTHING`);
    await target.query(`INSERT INTO ai_pdm_core.principal_accounts
        (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
         lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
      VALUES ($1,'qc-profile-owner','company-jenfu',$2,$3,'active',1,1,true,'aal1')`,
    [ownerTuple.principalId,ownerTuple.employeeId,ownerTuple.accountType]);
    // Static action metadata must come from the actual owner migration;
    // never repair a missing migration prerequisite with fixture seed.
    const action = await target.query(`SELECT * FROM ai_pdm_core.approval_platform_actions
      WHERE action_code='transfer.package_review'`);
    assert.equal(action.rowCount, 1, 'owner migration must register the transfer action');
    const actionMigration = fs.readFileSync(path.join(root,
      'db/postgres/075_dev121_transfer_action_registration.sql'), 'utf8');
    await target.query(actionMigration);
    const replayedAction = await target.query(`SELECT * FROM ai_pdm_core.approval_platform_actions
      WHERE action_code='transfer.package_review'`);
    assert.deepEqual(replayedAction.rows, action.rows,
      'migration replay must preserve existing canonical metadata and timestamps');
    const reviewIds = [
      ['APR-TRF-00000000-0000-4000-8000-000000000009','package-org-assigned','assigned','company-jenfu','qc-profile-owner'],
      ['APR-TRF-00000000-0000-4000-8000-000000000010','package-org-revoked','revoked','company-jenfu','qc-profile-owner'],
      ['APR-TRF-00000000-0000-4000-8000-000000000011','package-org-scoped','out-of-scope','company-jenfu','qc-profile-owner'],
      ['APR-TRF-00000000-0000-4000-8000-000000000012','package-org-restored','restored','company-jenfu','qc-profile-owner'],
      ['APR-TRF-00000000-0000-4000-8000-000000000013','package-org-other-company','wrong-company','company-other','qc-profile-other']
    ];
    const now = new Date().toISOString();
    const snapshotHash = 'b'.repeat(64);
    for (let index=0; index<reviewIds.length; index++) {
      const [requestId,packageId,label,companyId,packageOwner] = reviewIds[index];
      const packageCode = 'TP-DEV057-' + label.toUpperCase().replaceAll('-','_');
      await target.query(`INSERT INTO ai_pdm_core.transfer_packages
          (id,company_id,package_code,title,case_type,case_reason,source_reference_status,
           source_reference_reason,package_status,owner_id,created_by,create_idempotency_key,
           review_request_id,review_snapshot_hash,created_at,updated_at)
        VALUES ($1,$2,$3,$4,'development_case','Controlled DEV-057 fixture',
           'not_available','Task-owned disposable integration fixture','InReview',$5,$5,$6,$7,$8,$9,$9)`,
      [packageId,companyId,packageCode,'DEV-057 ' + label + ' transfer fixture',packageOwner,
        'dev057-transfer-fixture-' + label,requestId,snapshotHash,now]);
      await target.query(`INSERT INTO ai_pdm_core.approval_platform_requests
          (id,company_id,package_id,action_code,domain_code,request_status,title,reason,
           requested_by,payload_json,created_at,updated_at)
        VALUES ($1,$2,NULL,'transfer.package_review','transfer','pending',$3,
          'Controlled DEV-057 transfer reviewer fixture',$4,$5::jsonb,$6,$6)`,
      [requestId,companyId,'DEV-057 ' + label + ' transfer review',packageOwner,
        JSON.stringify({ transferPackageId:packageId,snapshotHash,
          reviewer:{ version:1,principalId:principal,profileId:'qc-profile-legacy' } }),now]);
    }
    await target.query(`INSERT INTO ai_pdm_core.part_roots
        (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by)
      VALUES ('part-root-dev057-flow','company-jenfu','QF057','DEV-057 flow fixture',
        'manufactured','Active','numbering-rule-v3-alpha-root','qc-profile-owner')`);
    await target.query(`INSERT INTO ai_pdm_core.part_numbers
        (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,
         item_kind,record_status,rule_version_id,created_by)
      VALUES ('part-org-flow','company-jenfu','part-root-dev057-flow','QF057-P01',1,
        'P01','DEV-057 transfer flow fixture','manufactured','Active',
        'numbering-rule-v3-alpha-root','qc-profile-owner')`);
    if (process.env.PDM_DEV121_NATIVE_PREVIEW_FIXTURE) {
      await target.query(`INSERT INTO ai_pdm_core.part_numbers
        (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,
         item_kind,record_status,rule_version_id,created_by)
        VALUES ('part-org-native','company-jenfu','part-root-dev057-flow','QF057-P02',2,
          'P02','Task-owned native attachment fixture','manufactured','Active',
          'numbering-rule-v3-alpha-root','qc-profile-owner')`);
    }
    await target.query(`INSERT INTO ai_pdm_core.transfer_packages
        (id,company_id,package_code,title,case_type,case_reason,source_reference_status,
         source_reference_reason,package_status,owner_id,created_by,create_idempotency_key,
         row_version,created_at,updated_at)
      VALUES ('package-org-flow','company-jenfu','TP-DEV057-FLOW',
        'DEV-057 normal transfer approval flow','development_case',
        'Controlled normal route flow','not_available',
        'Task-owned disposable integration fixture','Draft','qc-profile-owner',
        'qc-profile-owner','dev057-transfer-package-flow',1,$1,$1)`, [now]);
    await target.query(`INSERT INTO ai_pdm_core.transfer_package_items
        (id,company_id,package_id,entity_type,entity_id,entity_code,display_label,
         root_code,record_status,added_by,created_at)
      VALUES ('item-org-flow','company-jenfu','package-org-flow','part_number',
        'part-org-flow','QF057-P01','DEV-057 transfer flow fixture','QF057',
        'Active','qc-profile-owner',$1)`,[now]);
  }
  if (review) {
    const owner = process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID;
    assert.match(owner ?? '', /^principal-/u);
    await target.query(`INSERT INTO ai_pdm_core.users (id,display_name,role,company_id)
      VALUES ('qc-profile-owner','Synthetic owner','Engineer','company-jenfu');`);
    const authorityCommit = profile.environment.fixedValues.PDM_WORKBENCH_AUTHORITY_COMMIT;
    assert.match(authorityCommit ?? '', /^[a-f0-9]{40}$/u);
    await target.query(`UPDATE ai_pdm_core.pdm_workbench_state_authority_control
      SET mode='canonical_only',expected_commit=$1,schema_hash='dev090-v1'`, [authorityCommit]);
    await target.query(`INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
       lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
      VALUES ($1,'qc-profile-owner','company-jenfu','employee-three','human_personal','active',1,1,true,'aal1')`,[owner]);
  }
  if (nativeTransfer) {
    // Exercise the account command's actual SQL guard using the same published
    // producer and active owner catalog; only the registered session is synthetic.
    // Match the runtime hashJenfuPrincipalSessionId namespace exactly.
    const sessionHash = hash('pdm-principal-session-v2:dev057-profile-command-session:' + principal);
    await target.query(`INSERT INTO ai_pdm_core.principal_session_records
      (principal_id,session_id_hash,principal_auth_epoch,lifecycle_version,profile_version,
       authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
      VALUES ($1,$2,0,1,1,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour','aal1',$3)`,
      [principal,sessionHash,'c'.repeat(64)]);
    const published = await target.query(`SELECT role_code,catalog_version,contract_version
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      WHERE principal_id=$1 AND role_code='pdm_admin'`, [principal]);
    const managerFlow = process.env.DEV057_CONTRACT_PHASE === 'flow';
    assert.equal(published.rowCount,managerFlow ? 1 : 0,
      'only the actual published manager flow has the account capability');
    await target.query('BEGIN');
    try {
      await target.query('SET LOCAL ROLE dev057_ai_pdm_consumer_probe');
      await target.query(`SELECT ai_pdm_core.provision_principal_account_v1(
        $1::jsonb,$2,$3,$4,$5)`, [JSON.stringify({
          contractVersion:'ai-pdm.principal-provision.v1',operationId:'invalid-target-probe',
          principalRef:{principalId:'unverified-target',identityIssuer:'missing-issuer',
            identitySubject:'missing-subject',employeeId:'missing-employee',accountType:'human_personal',
            mappingVersion:1,publishedAt:'2026-01-01T00:00:00.000Z'},
          displayName:'Unverified target',contactEmail:null,accountEnabled:false,companyId:'company-jenfu'
        }),principal,actorTuple.issuer,actorTuple.subject,sessionHash]);
      assert.fail('unverified target must never provision');
    } catch (error) {
      assert.match(error.message,managerFlow ? /AIPDM_PROVISION_SOURCE_DRIFT/u
        : /AIPDM_PROVISION_PERMISSION_DENIED/u,
        'the actual grant, role and scope must decide the command before target validation');
    } finally { await target.query('ROLLBACK'); }
    assert.equal((await target.query("SELECT count(*)::int AS count FROM ai_pdm_core.principal_accounts WHERE principal_id='unverified-target'")).rows[0].count,0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM ai_pdm_core.principal_identity_operations WHERE operation_id='invalid-target-probe'")).rows[0].count,0);
    console.log('PASS actual published profile command guard: ' + process.env.DEV057_CONTRACT_PHASE + '; zero unverified account or receipt');


  }
  const consumer = new URL(ownerUrl); consumer.username = 'dev057_ai_pdm_consumer_probe';
  const transferProbe = process.env.DEV057_NATIVE_TRANSFER_PROBE === '1';
  const result = run(process.execPath, [path.join(root,'node_modules/vitest/vitest.mjs'),'run',
    transferProbe ? 'src/lib/transfer-package-principal-grants-v4.postgres-contract.test.ts'
      : review ? 'src/lib/principal-work-review-owner-grant.postgres-contract.test.ts'
        : 'src/lib/principal-numbering-owner-grant.postgres-contract.test.ts'], {
    env: { ...process.env,
      ...(transferProbe ? {
        DEV057_NUMBERING_PRINCIPAL_ID: actorTuple.principalId,
        DEV057_NUMBERING_EMPLOYEE_ID: actorTuple.employeeId,
        DEV057_NUMBERING_ACCOUNT_TYPE: actorTuple.accountType,
        DEV057_NUMBERING_ISSUER: actorTuple.issuer,
        DEV057_NUMBERING_SUBJECT: actorTuple.subject
      } : {}),
      CI:'1', PDM_PUBLIC_BASE_URL:'https://ai-pdm.test', PDM_STORAGE_PROVIDER:'local_repository',
      PDM_LOCAL_FAKE_PREVIEW_WORKER:'0',PDM_PREVIEW_WORKER_TOKEN:'dev057-task-owned-synthetic-preview-token', DEV121_NUMBERING_POSTGRES_URL: consumer.toString(),
      PDM_POSTGRES_URL: consumer.toString(), PDM_DB_PROVIDER:'postgres', DEV010_N2_DATABASE_BOUNDARY:'required',
      PDM_DATA_DIR:path.join(taskRoot,'aipdm-numbering-data'), PDM_REPOSITORY_DIR:path.join(taskRoot,'aipdm-numbering-repository'),
      PDM_PRODUCTION_SLICE_MODE:'official-numbering-draft', PDM_NUMBER_STATE_FLOW_V1:'1',
      PDM_AUTH_MODE:'firebase_bff',PDM_JENFU_PLATFORM_AUTH_MODE:'on',PDM_JENFU_ENTITLEMENT_MODE:'enforce',
      PDM_WORKBENCH_AUTHORITY_COMMIT:profile.environment.fixedValues.PDM_WORKBENCH_AUTHORITY_COMMIT,
      JENFU_FIREBASE_PROJECT_ID:'dev057-synthetic',PDM_FIREBASE_PROJECT_ID:'dev057-synthetic',
      JENFU_IDENTITY_AUDIENCE:'dev057-synthetic',JENFU_IDENTITY_ISSUER:'https://securetoken.google.com/dev057-synthetic',
      PDM_SESSION_ISSUER:'https://ai-pdm.test',PDM_SESSION_AUDIENCE:'dev057-numbering-qc',
      PDM_SESSION_CURRENT_KEY_ID:'dev057-qc-key',PDM_SESSION_CURRENT_SECRET:'task-owned-synthetic-session-secret-for-local-qc-only' }
  });
  if (transferProbe) {
    // Receipt storage is deliberately not readable by runtime. Verify absence
    // or uniqueness with the harness owner only, without widening runtime ACL.
    const operationCount = await target.query(`SELECT count(*)::int AS count
      FROM ai_pdm_core.principal_identity_operations WHERE operation_id='verified-profile-probe'`);
    assert.equal(operationCount.rows[0].count, process.env.DEV057_CONTRACT_PHASE === 'flow' ? 1 : 0);
    console.log('PASS owner receipt readback after actual profile route: ' + process.env.DEV057_CONTRACT_PHASE);
  }
  if (transferProbe) {
    const expectedTests = (process.env.DEV057_CONTRACT_PHASE === 'assigned' ? 3 : 2) +
      (process.env.DEV057_CONTRACT_PHASE === 'flow' && process.env.PDM_DEV121_NATIVE_PREVIEW_FIXTURE ? 1 : 0);
    const expectedSkipped = process.env.DEV057_CONTRACT_PHASE === 'flow' && process.env.PDM_DEV121_NATIVE_PREVIEW_FIXTURE ? 0 : 1;
    const expectedSummary = 'Tests\\s+' + expectedTests + ' passed' +
      (expectedSkipped ? ' \\| 1 skipped' : '') + '\\s+\\(' + (expectedTests + expectedSkipped) + '\\)';
    assert.match(result.stdout, new RegExp(expectedSummary, 'u'),
      'the selected v4 transfer route cases must all execute without skips');
  } else {
    assert.match(result.stdout, review ? /Tests\s+2 passed/u : /Tests\s+9 passed/u,
      'the selected actual business flow must execute, not skip');
  }
  console.log(JSON.stringify({ status:'PASS', phase:process.env.DEV057_CONTRACT_PHASE,
    consumerProbe: transferProbe ? 'orgmaster-v4-transfer-approval' : review ? 'principal-work-review' : 'principal-numbering',
    ...(transferProbe ? { actorPrincipalId: principal, actorAccountType: accountType,
      ownerPrincipalId: ownerTuple.principalId, ownerAccountType: ownerTuple.accountType } : {}),
    migrations,
    producer:'actual OrgMaster schema and published artifact snapshot from the parent isolated cluster',
    session:'synthetic verified-session input; no provider evidence', productionWrites:false }));
} finally {
  await target?.end();
  if (created) { await admin.query('DROP DATABASE ' + name); dropped = true; }
  await admin.end();
  if (fs.existsSync(dump)) fs.unlinkSync(dump);
  if (created && !dropped) throw new Error('DEV121_NUMBERING_DATABASE_CLEANUP_FAILED');
}
