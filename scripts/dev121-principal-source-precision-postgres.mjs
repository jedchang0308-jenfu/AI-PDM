// CI-only consumer regression. Typed/grant/epoch producers and signed sessions below
// are synthetic; this does not attest OrgMaster/provider/Production conformance.
// The candidate/parser/service and unchanged 071 lifecycle / 074 provision / 076 manager guard
// execute against a fresh database in the existing required CI PostgreSQL job.
// Native 078/080 and four settings commands are real; Secret Manager I/O is synthetic-only.
// Mounted share routes also execute actual Principal transactions; resource/provider fixtures are synthetic.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

assert.equal(process.env.DEV012_ISOLATED_POSTGRES, '1', 'TASK_OWNED_CI_POSTGRES_REQUIRED');
const baseUrl = new URL(process.env.PDM_POSTGRES_URL ?? '');
assert.equal(baseUrl.hostname, '127.0.0.1');
assert.equal(baseUrl.pathname, '/postgres');
assert.equal(baseUrl.username, 'postgres');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbName = 'dev121_precision_' + crypto.randomBytes(8).toString('hex');
assert.match(dbName, /^dev121_precision_[a-f0-9]{16}$/u);
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-dev121-precision-'));
process.env.PDM_DATA_DIR = path.join(taskRoot, 'data');
process.env.PDM_REPOSITORY_DIR = path.join(taskRoot, 'repository');
const admin = new pg.Client({ connectionString: baseUrl.toString() });
const roles = ['jenfu_ai_pdm_migrator', 'jenfu_ai_pdm_runtime'];
const createdRoles = [];
const checks = [];
const sourceProof = [];
let database, appDatabase, closeSettingsRuntime, created = false, dropped = false, tempRemoved = false;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const actor = { principalId: 'principal-precision-manager', employeeId: 'employee-precision-manager',
  identityIssuer: 'issuer-precision-manager', identitySubject: 'subject-precision-manager' };
const sessionId = 'dev121-precision-current-aal1-session';
const actorProfile = 'profile-precision-manager';
const at = '2026-09-23T16:09:04.891123Z';

try {
  await admin.connect();
  const identity = (await admin.query(`SELECT current_database() AS database,
    current_setting('server_version_num')::integer / 10000 AS major`)).rows[0];
  assert.equal(identity.database, 'postgres');
  assert.ok(identity.major >= 17);
  // This job's disposable cluster must not already contain app role ownership.
  // Never reuse or drop an unowned pre-existing role/database.
  for (const role of roles) {
    assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount, 0);
    await admin.query('CREATE ROLE ' + role + ' NOLOGIN');
    createdRoles.push(role);
  }
  await admin.query('CREATE DATABASE ' + dbName);
  created = true;
  const targetUrl = new URL(baseUrl); targetUrl.pathname = '/' + dbName;
  database = new pg.Client({ connectionString: targetUrl.toString() });
  await database.connect();
  assert.equal((await database.query('SELECT current_database() AS database')).rows[0].database, dbName);
  console.log(JSON.stringify({ runtimeDeclaration: { project: root,
    purpose: 'DEV121 precision and inactive session consumer regression; synthetic producers/session',
    port: Number(baseUrl.port || '5432'), owningProcessTree: 'required CI PostgreSQL service / this test client',
    mutationScope: dbName, PDM_DATA_DIR: process.env.PDM_DATA_DIR,
    PDM_REPOSITORY_DIR: process.env.PDM_REPOSITORY_DIR,
    cleanupCondition: 'Close this client, drop only this generated database and newly created roles, remove own temp root',
    productionWrites: false } }));
  await database.query(`
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_contract;
    CREATE SCHEMA platform_contract;
    CREATE TABLE platform_contract.principal_state_fixture (
      principal_id text PRIMARY KEY,auth_epoch bigint NOT NULL,revoked_before timestamptz);
    CREATE FUNCTION platform_contract.read_principal_auth_state_v3(p_principal_id text)
      RETURNS TABLE (principal_id text,auth_epoch bigint,revoked_before timestamptz)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
      AS 'SELECT state.principal_id,state.auth_epoch,state.revoked_before
          FROM platform_contract.principal_state_fixture state WHERE state.principal_id=p_principal_id';
    CREATE TABLE orgmaster_contract.v_active_principal_accounts_v1 (
      contract_version text,principal_issuer text,principal_subject text,principal_id text,
      employee_id text,employee_status text,account_type text,mapping_version bigint,published_at timestamptz);
    CREATE TABLE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 (
      contract_version text,application_id text,principal_id text,employee_id text,
      assignment_version_id text,assignment_version bigint,assignment_id text,
      stable_role_id text,role_code text,catalog_version text,subject_kind text,
      target_principal_id text,grant_kind text,delegation_id text,
      scope_kind text,scope_key text,valid_from timestamptz,valid_until timestamptz,published_at timestamptz);
    CREATE TABLE ai_pdm_contract.v_application_role_catalog_v1 (
      contract_version text,application_id text,catalog_version text,catalog_sha256 text,
      display_order integer,stable_role_id text,role_definition_hash text,role_code text,
      assignable boolean,subject_kind text,allowed_scope_kinds jsonb,permissions jsonb);
    CREATE TABLE ai_pdm_core.companies (id text PRIMARY KEY);
    CREATE TABLE ai_pdm_core.users (
      id text PRIMARY KEY,display_name text,email text,password_hash text,role text,company_id text,
      account_status text,system_role_enabled integer,account_status_changed_at timestamptz,account_status_reason text);
    CREATE TABLE ai_pdm_core.principal_accounts (
      principal_id text PRIMARY KEY,pdm_user_id text UNIQUE REFERENCES ai_pdm_core.users(id),
      company_id text,employee_id text,account_type text,account_status text,
      lifecycle_version bigint,profile_version bigint,system_role_enabled boolean,
      minimum_assurance text,session_invalid_before timestamptz,updated_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE ai_pdm_core.principal_session_records (
      principal_id text,session_id_hash text,issued_at timestamptz,expires_at timestamptz,
      revoked_at timestamptz,lifecycle_version bigint,profile_version bigint,
      principal_auth_epoch bigint,authenticated_at timestamptz,assurance_level text,
      assurance_policy_hash text,revoke_reason text);
    CREATE TABLE ai_pdm_core.principal_identity_operations (
      operation_id text PRIMARY KEY,operation_kind text,input_hash text,cohort_hash text,
      result_json jsonb,committed_at timestamptz);
    CREATE TABLE ai_pdm_core.principal_identity_cutovers (
      pdm_user_id text,principal_id text UNIQUE,status text,source_hash text,operation_id text,activated_at timestamptz);
    CREATE TABLE ai_pdm_core.role_priority_versions (status text,priority_json text);
    GRANT USAGE ON SCHEMA ai_pdm_core,ai_pdm_contract,orgmaster_contract
      TO jenfu_ai_pdm_migrator,jenfu_ai_pdm_runtime;
    GRANT ALL ON ALL TABLES IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_migrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA orgmaster_contract,ai_pdm_contract
      TO jenfu_ai_pdm_migrator,jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.role_priority_versions TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.principal_accounts,ai_pdm_core.users,ai_pdm_core.principal_session_records
      TO jenfu_ai_pdm_runtime;
    GRANT INSERT ON ai_pdm_core.principal_session_records TO jenfu_ai_pdm_runtime;
    GRANT USAGE ON SCHEMA platform_contract TO jenfu_ai_pdm_runtime;
    GRANT EXECUTE ON FUNCTION platform_contract.read_principal_auth_state_v3(text) TO jenfu_ai_pdm_runtime;
  `);
  const path074 = 'db/postgres/074_dev121_principal_human_assurance_aal1.sql';
  const source074 = fs.readFileSync(path.join(root, path074), 'utf8').replaceAll('\r\n', '\n');
  const marker = 'CREATE OR REPLACE FUNCTION ai_pdm_core.provision_principal_account_v1(';
  const start = source074.indexOf(marker);
  assert.ok(start >= 0 && source074.indexOf(marker, start + marker.length) < 0);
  // Preserve the function and its ACL verbatim; the assurance data transition
  // belongs to full migration suites and is deliberately outside this fixture.
  const provisionSql = source074.slice(start, source074.lastIndexOf('\nCOMMIT;'));
  await database.query('BEGIN');
  await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator');
  await database.query(provisionSql);
  await database.query('COMMIT');
  sourceProof.push({ path: path074, sourceSha256: sha(source074),
    executedFunctionSha256: sha(provisionSql), scope: 'unchanged provision function and ACL only' });
  const path076 = 'db/postgres/076_dev121_principal_account_command_grants_v4.sql';
  const source076 = fs.readFileSync(path.join(root, path076), 'utf8').replaceAll('\r\n', '\n');
  await database.query(source076);
  sourceProof.push({ path: path076, sourceSha256: sha(source076), scope: 'complete unchanged migration in disposable fixture' });
  const path071 = 'db/postgres/071_dev121_principal_account_owner_no_cutover.sql';
  const source071 = fs.readFileSync(path.join(root,path071),'utf8').replaceAll('\r\n','\n');
  const lifecycleMarker = 'CREATE OR REPLACE FUNCTION ai_pdm_core.update_principal_account_lifecycle_v1(';
  const lifecycleStart = source071.indexOf(lifecycleMarker);
  const lifecycleEnd = source071.indexOf('CREATE OR REPLACE FUNCTION ai_pdm_core.revoke_principal_account_sessions_v1(',lifecycleStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart &&
    source071.indexOf(lifecycleMarker,lifecycleStart+lifecycleMarker.length) < 0);
  const lifecycleSql = source071.slice(lifecycleStart,lifecycleEnd);
  await database.query('BEGIN');
  await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator');
  await database.query(lifecycleSql);
  await database.query('COMMIT');
  sourceProof.push({ path: path071,sourceSha256: sha(source071),executedFunctionSha256: sha(lifecycleSql),
    scope: 'unchanged lifecycle function and ACL only; current 076 management guard' });
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/access-control/jenfu-role-catalog.v5.json'), 'utf8'));
  for (const [order, role] of catalog.roles.entries()) {
    await database.query(`INSERT INTO ai_pdm_contract.v_application_role_catalog_v1
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    [catalog.contractVersion,catalog.applicationId,catalog.catalogVersion,catalog.catalogSha256,
      order,role.stableRoleId,role.roleDefinitionHash,role.roleCode,role.assignable,role.subjectKind,
      JSON.stringify(role.allowedScopeKinds),JSON.stringify(role.permissions)]);
  }
  await database.query(`INSERT INTO ai_pdm_core.role_priority_versions VALUES ('active',$1)`,
    [JSON.stringify(catalog.roles.map(role => role.roleCode))]);
  await database.query(`INSERT INTO ai_pdm_core.companies VALUES ('company-jenfu');
    INSERT INTO ai_pdm_core.users (id,company_id) VALUES ('profile-precision-manager','company-jenfu');`);
  await database.query(`INSERT INTO ai_pdm_core.principal_accounts
    (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
      profile_version,system_role_enabled,minimum_assurance)
    VALUES ($1,$2,'company-jenfu',$3,'human_personal','active',1,1,true,'aal1')`,
  [actor.principalId,actorProfile,actor.employeeId]);
  await database.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
    VALUES ('organization.active-principal.v1',$1,$2,$3,$4,'active','human_personal',7,$5::timestamptz)`,
  [actor.identityIssuer,actor.identitySubject,actor.principalId,actor.employeeId,at]);
  await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    VALUES ('jenfu.orgmaster.ai-pdm-principal-grants.v4','ai-pdm',$1,$2,
      'precision-grant-publication',7,'precision-manager-assignment','role-pdm-admin','pdm_admin',$3,
      'employee',NULL,'direct',NULL,'workspace','company-jenfu',
      clock_timestamp()-interval '1 minute',NULL,$4::timestamptz)`,
  [actor.principalId,actor.employeeId,catalog.catalogVersion,at]);
  const { hashJenfuPrincipalSessionId } = await import(pathToFileURL(path.join(root, 'src/lib/jenfu-principal-session-registry.ts')).href);
  const sessionHash = hashJenfuPrincipalSessionId(sessionId);
  await database.query(`INSERT INTO ai_pdm_core.principal_session_records
    (principal_id,session_id_hash,issued_at,expires_at,revoked_at,lifecycle_version,profile_version)
    VALUES ($1,$2,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour',NULL,1,1)`,
  [actor.principalId,sessionHash]);
  const { JenfuPrincipalCandidateRepository } = await import(pathToFileURL(path.join(root, 'src/lib/jenfu-principal-candidate-repository.ts')).href);
  const { parseJenfuPrincipalProvisionRequest } = await import(pathToFileURL(path.join(root, 'src/lib/jenfu-principal-provision-contract.ts')).href);
  const { provisionPrincipalAccountInSnapshot } = await import(pathToFileURL(path.join(root, 'src/lib/jenfu-principal-provision-service.ts')).href);
  const { jenfuEntitlementFailureResponse } = await import(pathToFileURL(path.join(root, 'src/lib/jenfu-entitlement-http.ts')).href);
  const { createAsyncDatabaseClient } = await import(pathToFileURL(path.join(root, 'src/lib/db-async-provider.ts')).href);
  // Use the production async provider and named-parameter binder, not a test
  // SQL parser. The app pool is bounded and points only to this generated DB.
  appDatabase = createAsyncDatabaseClient({ kind: 'postgres',connectionString: targetUrl.toString(),
    maxConnections: 1,searchPath: 'ai_pdm_core,public' });
  const verified = { profile: { pdmUserId: actorProfile, companyId: 'company-jenfu' },
    session: { contractVersion: 'jenfu.ai-pdm-session.v2',appId: 'ai-pdm',sessionId,
      ...actor,authEpoch: 0,profileVersion: 1,issuedAt: new Date(Date.now()-1000).toISOString(),
      expiresAt: new Date(Date.now()+3600000).toISOString(),assuranceLevel: 'aal1' } };
  async function transaction(action) {
    await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await database.query('SET LOCAL ROLE jenfu_ai_pdm_runtime');
      await database.query('SET LOCAL search_path=ai_pdm_core,public');
      const value = await action();
      await database.query('COMMIT');
      return value;
    } catch (error) { await database.query('ROLLBACK'); throw error; }
  }
  const native = request => transaction(async () => (await database.query(`
    SELECT ai_pdm_core.provision_principal_account_v1($1::jsonb,$2,$3,$4,$5) AS receipt`,
  [JSON.stringify({ ...request,companyId: 'company-jenfu' }),actor.principalId,
    actor.identityIssuer,actor.identitySubject,sessionHash])).rows[0].receipt);
  const appTransaction = (action, timezone = 'UTC') => appDatabase.transaction(async snapshot => {
    await snapshot.execute('SET LOCAL ROLE jenfu_ai_pdm_runtime');
    await snapshot.execute(timezone === 'Asia/Taipei' ? "SET LOCAL TIME ZONE 'Asia/Taipei'" : "SET LOCAL TIME ZONE 'UTC'");
    return action(snapshot);
  },{ isolationLevel: 'serializable',readOnly: false });
  const service = request => appTransaction(snapshot => provisionPrincipalAccountInSnapshot(snapshot,verified,request));
  const candidates = (principalId, timezone) => appTransaction(snapshot =>
    new JenfuPrincipalCandidateRepository(snapshot).listByPrincipal(principalId),timezone);
  const counts = async () => (await database.query(`SELECT
    (SELECT count(*)::integer FROM ai_pdm_core.users) AS profiles,
    (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts) AS accounts,
    (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_operations) AS receipts,
    (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_cutovers) AS markers`)).rows[0];
  const before = await counts();
  assert.deepEqual(before,{ profiles: 1,accounts: 1,receipts: 0,markers: 0 });
  const target = 'principal-precision-target';
  await database.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
    VALUES ('organization.active-principal.v1','issuer-precision-target','subject-precision-target',
      $1,'employee-precision-target','active','human_personal',7,$2::timestamptz)`,[target,at]);
  const published = (await database.query(`SELECT published_at FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE principal_id=$1`,[target])).rows[0].published_at;
  assert.ok(published instanceof Date);
  const lossy = { principalId: target,identityIssuer: 'issuer-precision-target',identitySubject: 'subject-precision-target',
    employeeId: 'employee-precision-target',accountType: 'human_personal',mappingVersion: 7,
    publishedAt: published.toISOString() };
  assert.equal(lossy.publishedAt,'2026-09-23T16:09:04.891Z');
  const body = { contractVersion: 'ai-pdm.principal-provision.v1',operationId: 'precision-create',
    principalRef: lossy,displayName: 'Synthetic precision target',contactEmail: null,accountEnabled: false };
  await assert.rejects(native(body),/AIPDM_PROVISION_SOURCE_DRIFT/u);
  assert.deepEqual(await counts(),before);
  checks.push('baseline pg Date milliseconds -> unchanged 074 source_drift; zero profile/account/receipt/marker writes');
  const utc = await candidates(target,'UTC');
  const taipei = await candidates(target,'Asia/Taipei');
  assert.deepEqual(taipei,utc);
  assert.equal(utc.length,1);
  assert.equal(utc[0].publishedAt,at);
  const input = { ...body,principalRef: utc[0] };
  assert.equal(parseJenfuPrincipalProvisionRequest(input).principalRef.publishedAt,at);
  await assert.rejects(service({ ...input,operationId: 'precision-wrong',
    principalRef: { ...utc[0],publishedAt: '2026-09-23T16:09:04.891124Z' } }),
  error => error.code === 'source_drift' && error.httpStatus === 409);
  assert.deepEqual(await counts(),before);
  checks.push('UTC/Asia-Taipei candidate and parser retain six digits; one-microsecond drift 409 has zero writes');
  const first = await service(input);
  assert.equal(first.principalId,target);
  assert.equal(first.replayed,false);
  assert.equal(first.current.accountStatus,'suspended');
  const after = await counts();
  assert.deepEqual(after,{ profiles: 2,accounts: 2,receipts: 1,markers: 1 });
  const replay = await service(input);
  assert.equal(replay.replayed,true);
  assert.equal(replay.pdmUserId,first.pdmUserId);
  assert.deepEqual(await counts(),after);
  await database.query(`UPDATE orgmaster_contract.v_active_principal_accounts_v1
    SET mapping_version=8,published_at=published_at+interval '1 microsecond' WHERE principal_id=$1`,[target]);
  const replayAfterProducerChange = await service(input);
  assert.equal(replayAfterProducerChange.replayed,true);
  assert.equal(replayAfterProducerChange.pdmUserId,first.pdmUserId);
  assert.equal(replayAfterProducerChange.committedAt,first.committedAt);
  assert.deepEqual(await counts(),after);
  await assert.rejects(service({ ...input,operationId: 'precision-new-stale' }),
    error => error.code === 'source_drift' && error.httpStatus === 409);
  await assert.rejects(service({ ...input,displayName: 'Changed replay request' }),
    error => error.code === 'operation_conflict' && error.httpStatus === 409);
  assert.deepEqual(await counts(),after);
  checks.push('real service/native command commits suspended once; exact replay survives producer revision; new stale write and changed replay rejected');
  await database.query(`DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    WHERE principal_id=$1`,[actor.principalId]);
  await assert.rejects(service(input),error => error.code === 'entitlement_assignment_not_found' &&
    jenfuEntitlementFailureResponse(error.code).status === 403);
  await assert.rejects(native(input),/AIPDM_PROVISION_PERMISSION_DENIED/u);
  assert.deepEqual(await counts(),after);
  checks.push('current actor grant revoked -> replay denied; no extra effects');
  await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    VALUES ('jenfu.orgmaster.ai-pdm-principal-grants.v4','ai-pdm',$1,$2,
      'precision-grant-publication',7,'precision-manager-assignment','role-pdm-admin','pdm_admin',$3,
      'employee',NULL,'direct',NULL,'workspace','company-jenfu',
      clock_timestamp()-interval '1 minute',NULL,$4::timestamptz)`,
  [actor.principalId,actor.employeeId,catalog.catalogVersion,at]);
  const aligned = 'principal-precision-millisecond-aligned';
  await database.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
    VALUES ('organization.active-principal.v1','issuer-precision-aligned','subject-precision-aligned',
      $1,'employee-precision-aligned','active','human_personal',7,'2026-09-23T16:09:04.891000Z')`,[aligned]);
  const [alignedRef] = await candidates(aligned,'UTC');
  assert.equal(alignedRef.publishedAt,'2026-09-23T16:09:04.891000Z');
  const alignedReceipt = await service({ ...body,operationId: 'precision-ms-aligned',
    principalRef: { ...alignedRef,publishedAt: '2026-09-23T16:09:04.891Z' } });
  assert.equal(alignedReceipt.principalId,aligned);
  assert.equal(alignedReceipt.current.accountStatus,'suspended');
  assert.deepEqual(await counts(),{ profiles: 3,accounts: 3,receipts: 2,markers: 2 });
  checks.push('legacy three-digit exact millisecond payload matches only .891000 native instant');

  // Exercise the public admission boundary after the real owner lifecycle
  // command, not a mocked repository failure or a fabricated expected status.
  const { issueJenfuPrincipalSession,verifyJenfuPrincipalSession } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-session.ts')).href);
  const { JenfuPrincipalSessionRegistry } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-session-registry.ts')).href);
  const { principalAssurancePolicyHash } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-assurance.ts')).href);
  const { withVerifiedJenfuPrincipalRequest } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-request-guard.ts')).href);
  const { principalRequestFailure } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-http.ts')).href);
  const { issueSessionForPrincipalHandoff } = await import(pathToFileURL(path.join(root,'src/lib/jenfu-principal-handoff-session-service.ts')).href);
  await database.query(`INSERT INTO platform_contract.principal_state_fixture VALUES ($1,0,NULL)`,[target]);
  await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    VALUES ('jenfu.orgmaster.ai-pdm-principal-grants.v4','ai-pdm',$1,'employee-precision-target',
      'precision-grant-publication',7,'precision-target-assignment','role-rd','rd',$2,
      'employee',NULL,'direct',NULL,'workspace','company-jenfu',
      clock_timestamp()-interval '1 minute',NULL,$3::timestamptz)`,[target,catalog.catalogVersion,at]);
  const lifecycle = (operationId,action) => transaction(async () => (await database.query(`
    SELECT ai_pdm_core.update_principal_account_lifecycle_v1(
      $1,$2,$3,'synthetic lifecycle admission regression','company-jenfu',$4,$5,$6,$7) AS receipt`,
  [operationId,first.pdmUserId,action,actor.principalId,actor.identityIssuer,actor.identitySubject,sessionHash])).rows[0].receipt);
  const activated = await lifecycle('lifecycle-activate','reactivate');
  assert.equal(activated.accountStatus,'active');
  assert.equal(activated.lifecycleVersion,2);
  const trustPolicy = { enabled: false,domains: ['example.test'],allowAal1PrivilegedPilot: true };
  const keyRing = { issuer: 'https://pdm.example.test',audience: 'ai-pdm',currentKeyId: 'fixture',
    keys: { fixture: 'synthetic-session-test-signing-key-at-least-32-bytes' } };
  const signedSession = async version => {
    const seconds = Math.floor(Date.now()/1000)+1;
    const token = issueJenfuPrincipalSession({ principalId: target,employeeId: 'employee-precision-target',
      identityIssuer: 'issuer-precision-target',identitySubject: 'subject-precision-target',
      authEpoch: 0,accountLifecycleVersion: version,profileVersion: 1,companyId: 'company-jenfu',
      authenticatedAt: seconds-30,assuranceLevel: 'aal1',secondFactor: null,
      assurancePolicyHash: principalAssurancePolicyHash(trustPolicy),maxAgeSeconds: 600 },keyRing,seconds);
    const claims = verifyJenfuPrincipalSession(token,keyRing,{ nowSeconds: seconds });
    await appTransaction(snapshot => new JenfuPrincipalSessionRegistry(snapshot).register(claims));
    return { token,claims,seconds };
  };
  const guardDatabase = { kind: appDatabase.kind,
    transaction: (callback,options) => appDatabase.transaction(async snapshot => {
      await snapshot.execute('SET LOCAL ROLE jenfu_ai_pdm_runtime');
      return callback(snapshot);
    },options) };
  let authorizedEffects = 0;
  const admittedResponse = async session => {
    try {
      return await withVerifiedJenfuPrincipalRequest({ token: session.token,keyRing,trustPolicy,
        identityIssuer: 'issuer-precision-target',database: guardDatabase,nowSeconds: session.seconds },
      async (_snapshot,verifiedPrincipal) => {
        authorizedEffects++;
        return Response.json({ principalId: verifiedPrincipal.session.principalId });
      });
    } catch (error) { return principalRequestFailure(error); }
  };
  const oldSession = await signedSession(2);
  assert.equal((await admittedResponse(oldSession)).status,200);
  const suspended = await lifecycle('lifecycle-suspend','suspend');
  assert.equal(suspended.accountStatus,'suspended');
  assert.equal(suspended.lifecycleVersion,3);
  const withdrawn = (await database.query(`SELECT account_status,lifecycle_version,system_role_enabled,
    session_invalid_before,(SELECT count(*)::integer FROM ai_pdm_core.principal_session_records
      WHERE principal_id=$1 AND revoked_at IS NULL) AS live_sessions
    FROM ai_pdm_core.principal_accounts WHERE principal_id=$1`,[target])).rows[0];
  assert.equal(withdrawn.account_status,'suspended');
  assert.equal(withdrawn.lifecycle_version,'3');
  assert.equal(withdrawn.system_role_enabled,false);
  assert.ok(withdrawn.session_invalid_before instanceof Date);
  assert.equal(withdrawn.live_sessions,0);
  const deniedSession = await admittedResponse(oldSession);
  assert.equal(deniedSession.status,401);
  assert.deepEqual(await deniedSession.json(),{ code: 'auth_session_invalid' });
  assert.equal(authorizedEffects,1);
  const beforeHandoffSessions = (await database.query(`SELECT count(*)::integer AS n
    FROM ai_pdm_core.principal_session_records WHERE principal_id=$1`,[target])).rows[0].n;
  const handoffNow = Date.now();
  await assert.rejects(issueSessionForPrincipalHandoff({ database: guardDatabase,keyRing,trustPolicy,
    expectedIdentityIssuer: 'issuer-precision-target',nowMs: handoffNow,
    handoff: { identity: { principalId: target,employeeId: 'employee-precision-target',
      identityIssuer: 'issuer-precision-target',identitySubject: 'subject-precision-target' },
      contractVersion: 'jenfu.sso-handoff.v2',issuer: 'https://platform.example.test/api/sso',audience: 'ai-pdm',
      authentication: { authenticatedAt: new Date(handoffNow-30000).toISOString(),
        email: 'synthetic@example.test',emailVerified: true,signInProvider: 'google.com',secondFactor: null,assuranceLevel: 'aal1' },
      authState: { authEpoch: 0,revokedBefore: null },issuedAt: new Date(handoffNow).toISOString(),
      sourceSessionExpiresAt: new Date(handoffNow+600000).toISOString(),expiresAt: new Date(handoffNow+30000).toISOString() }
  }),error => error.code === 'principal_account_inactive');
  assert.equal((await database.query(`SELECT count(*)::integer AS n
    FROM ai_pdm_core.principal_session_records WHERE principal_id=$1`,[target])).rows[0].n,beforeHandoffSessions);
  checks.push('actual 071/076 suspend atomically advances lifecycle and revokes registry; actual guard/public mapper returns 401; handoff mints no session');
  await database.query('ALTER TABLE ai_pdm_core.principal_accounts RENAME TO principal_accounts_unavailable_fixture');
  try {
    const unavailable = await admittedResponse(oldSession);
    assert.equal(unavailable.status,503);
    assert.deepEqual(await unavailable.json(),{ code: 'principal_dependency_unavailable' });
  } finally { await database.query('ALTER TABLE ai_pdm_core.principal_accounts_unavailable_fixture RENAME TO principal_accounts'); }
  await database.query('UPDATE ai_pdm_core.principal_accounts SET lifecycle_version=0 WHERE principal_id=$1',[target]);
  try { assert.equal((await admittedResponse(oldSession)).status,503); }
  finally { await database.query('UPDATE ai_pdm_core.principal_accounts SET lifecycle_version=3 WHERE principal_id=$1',[target]); }
  await database.query('UPDATE ai_pdm_core.users SET company_id=$2 WHERE id=$1',[first.pdmUserId,'synthetic-profile-mismatch']);
  try { assert.equal((await admittedResponse(oldSession)).status,503); }
  finally { await database.query('UPDATE ai_pdm_core.users SET company_id=$2 WHERE id=$1',[first.pdmUserId,'company-jenfu']); }
  assert.equal(authorizedEffects,1);
  const reactivated = await lifecycle('lifecycle-reactivate','reactivate');
  assert.equal(reactivated.lifecycleVersion,4);
  assert.equal((await admittedResponse(oldSession)).status,401);
  assert.equal(authorizedEffects,1);
  const freshSession = await signedSession(4);
  assert.equal((await admittedResponse(freshSession)).status,200);
  assert.equal(authorizedEffects,2);
  const producerRow = (await database.query(`SELECT to_jsonb(typed) AS value
    FROM orgmaster_contract.v_active_principal_accounts_v1 typed WHERE principal_id=$1`,[target])).rows[0].value;
  await database.query('DELETE FROM orgmaster_contract.v_active_principal_accounts_v1 WHERE principal_id=$1',[target]);
  try {
    const inactiveProducer = await admittedResponse(freshSession);
    assert.equal(inactiveProducer.status,401);
    assert.deepEqual(await inactiveProducer.json(),{ code: 'auth_session_invalid' });
  } finally {
    await database.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
      SELECT * FROM jsonb_populate_record(NULL::orgmaster_contract.v_active_principal_accounts_v1,$1::jsonb)`,[JSON.stringify(producerRow)]);
  }
  assert.equal(authorizedEffects,2);
  assert.equal((await admittedResponse(freshSession)).status,200);
  assert.equal(authorizedEffects,3);
  checks.push('query/malformed/missing association stay 503; reactivation rejects old session; zero typed producer denies 401 and exact producer restore admits fresh session');
// Added to the existing synthetic consumer fixture; provider I/O alone is mocked.
  await database.query(`
    ALTER TABLE ai_pdm_core.principal_accounts ADD CONSTRAINT precision_principal_company_profile
      UNIQUE(company_id,pdm_user_id,principal_id);
    CREATE TABLE ai_pdm_core.secret_references (
      id text PRIMARY KEY,kind text,provider text,display_name text,vault_provider text,vault_secret_id text,
      masked_hint text,fingerprint text,lifecycle_status text,version integer,created_by text REFERENCES ai_pdm_core.users(id),
      created_at timestamptz,tested_at timestamptz,activated_by text,activated_at timestamptz,
      retired_by text,retired_at timestamptz,revoked_by text,revoked_at timestamptz,revoke_reason text,metadata_json text);
    CREATE TABLE ai_pdm_core.setting_test_runs (id text PRIMARY KEY,secret_reference_id text REFERENCES ai_pdm_core.secret_references(id),
      kind text,provider text,result_status text,summary text,redacted_error text,artifact_path text,tested_by text,
      tested_at timestamptz,metadata_json text);
    CREATE TABLE ai_pdm_core.setting_activation_events (id text PRIMARY KEY,secret_reference_id text REFERENCES ai_pdm_core.secret_references(id),
      kind text,event_type text,actor_id text,event_at timestamptz,detail_json text);
    CREATE TABLE ai_pdm_core.audit_logs (id text PRIMARY KEY,submission_id text,actor_id text,action text,detail_json text,
      company_id text,scope_kind text,created_at timestamptz);
    CREATE TABLE ai_pdm_core.platform_command_receipts (id text PRIMARY KEY,company_id text,command_name text,schema_version integer,
      idempotency_key text,actor_id text,principal_id text,platform_principal_id text,platform_organization_id text,
      correlation_id text,command_status text,response_json text,created_at timestamptz,completed_at timestamptz,
      UNIQUE(company_id,command_name,idempotency_key));
    CREATE TABLE ai_pdm_core.platform_outbox_events (id text PRIMARY KEY,company_id text,aggregate_type text,aggregate_id text,
      event_type text,schema_version integer,payload_json text,actor_id text,principal_id text,platform_principal_id text,
      platform_organization_id text,correlation_id text,idempotency_key text,delivery_status text,attempt_count integer,
      occurred_at timestamptz,updated_at timestamptz,UNIQUE(company_id,event_type,idempotency_key));
  `);
  const schema048 = fs.readFileSync(path.join(root,'db/postgres/048_solidworks_credential_ui_activation.sql'),'utf8').replaceAll('\r\n','\n');
  const jobsStart = schema048.indexOf('CREATE TABLE IF NOT EXISTS public.settings_secret_probe_jobs');
  const jobsEnd = schema048.indexOf('CREATE TABLE IF NOT EXISTS public.worker_capability_heartbeats');
  assert.ok(jobsStart >= 0 && jobsEnd > jobsStart);
  const jobsSql = schema048.slice(jobsStart,jobsEnd).replaceAll('public.','ai_pdm_core.');
  await database.query(jobsSql);
  const heartbeatSql = schema048.slice(jobsEnd).replaceAll('public.','ai_pdm_core.');
  await database.query(heartbeatSql);
  sourceProof.push({ path:'db/postgres/048_solidworks_credential_ui_activation.sql',sourceSha256:sha(schema048),
    executedFunctionSha256:sha(jobsSql),scope:'actual probe table/index DDL projected to own schema; other baseline tables synthetic' });
  // A genuinely pre-078 legacy row remains NULL; do not disable the new trigger to fabricate one.
  await database.query(`INSERT INTO ai_pdm_core.secret_references (id,kind,provider,vault_provider,lifecycle_status,version,created_by,created_at,metadata_json)
    VALUES ('secret-legacy','solidworks_document_manager','solidworks_document_manager','google_secret_manager','draft',999,$1,clock_timestamp(),'{"companyId":"company-jenfu","securityActor":{"kind":"human","principalId":"principal-precision-manager","profileVersion":1}}')`,[actorProfile]);
  await database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs(id,secret_reference_id,kind,status,created_by,updated_at)
    VALUES ('probe-legacy','secret-legacy','solidworks_document_manager','pending',$1,clock_timestamp()-interval '2 minutes')`,[actorProfile]);
  await database.query(`INSERT INTO ai_pdm_core.secret_references (id,kind,provider,vault_provider,lifecycle_status,version,created_by,created_at,metadata_json)
    VALUES ('secret-legacy-passed','solidworks_document_manager','solidworks_document_manager','google_secret_manager','tested',998,$1,clock_timestamp(),'{"companyId":"company-jenfu","securityActor":{"kind":"human","principalId":"principal-precision-manager","profileVersion":1}}')`,[actorProfile]);
  await database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs(id,secret_reference_id,kind,status,created_by,updated_at)
    VALUES ('probe-legacy-passed','secret-legacy-passed','solidworks_document_manager','passed',$1,clock_timestamp()-interval '2 minutes')`,[actorProfile]);
  await database.query('ALTER TABLE ai_pdm_core.settings_secret_probe_jobs OWNER TO jenfu_ai_pdm_migrator');
  const source078 = fs.readFileSync(path.join(root,'db/postgres/078_dev121_settings_probe_principal_provenance.sql'),'utf8').replaceAll('\r\n','\n');
  await database.query(source078);
  sourceProof.push({ path:'db/postgres/078_dev121_settings_probe_principal_provenance.sql',sourceSha256:sha(source078),scope:'complete new migration, immutable trigger and composite FK on disposable fixture' });
  // Current lifecycle also reads durable consent/progress; apply complete080 in this disposable fixture.
  await database.query('GRANT REFERENCES ON ai_pdm_core.secret_references,ai_pdm_core.setting_test_runs TO jenfu_ai_pdm_migrator');
  const path080='db/postgres/080_dev122_settings_secret_activation_intents.sql';
  const source080=fs.readFileSync(path.join(root,path080),'utf8').replaceAll('\r\n','\n');
  await database.query(source080);
  sourceProof.push({path:path080,sourceSha256:sha(source080),scope:'complete unchanged080; legacy test-only commands, no auto-activation consent fabricated'});
  await database.query(`GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.secret_references,ai_pdm_core.setting_test_runs,
    ai_pdm_core.setting_activation_events,ai_pdm_core.audit_logs,ai_pdm_core.platform_command_receipts,
    ai_pdm_core.platform_outbox_events,ai_pdm_core.settings_secret_probe_jobs TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.worker_capability_heartbeats TO jenfu_ai_pdm_runtime;
    INSERT INTO platform_contract.principal_state_fixture VALUES ('principal-precision-manager',0,NULL);`);
  // Install only the provider seam. Actual service, command snapshot, ACL/binder,
  // guard, receipt/outbox/audit and native 078 are not mocked.
  const providerUrl = 'data:text/javascript,' + encodeURIComponent(`
    export class GoogleSecretManagerError extends Error {}
    export const getGoogleSecretManagerConfig = () => ({projectId:'synthetic-project',secretId:'synthetic-secret'});
    export const isGoogleSecretManagerReadEnabled = () => true;
    export const isGoogleSecretManagerWriteEnabled = () => true;
    export class GoogleSecretManagerProvider {
      async addVersion() { globalThis.__dev121SyntheticProviderWrites++;await globalThis.__dev121BeforeSyntheticProviderReturn?.();return 'projects/synthetic-project/secrets/synthetic-secret/versions/1'; }
      async accessVersion() { throw Error('REAL_OR_SYNTHETIC_SECRET_ACCESS_FORBIDDEN_IN_PG_TEST'); }
    }
  `);
  const providerLoader = path.join(taskRoot,'settings-provider-loader.mjs');
  fs.writeFileSync(providerLoader,`export async function resolve(specifier,context,nextResolve) {
    if (specifier === '@/lib/google-secret-manager') return {url:${JSON.stringify(providerUrl)},shortCircuit:true};
    return nextResolve(specifier,context);
  }\n`);
  const { register } = await import('node:module');
  register(pathToFileURL(providerLoader),import.meta.url);
  globalThis.__dev121SyntheticProviderWrites = 0;
  process.env.PDM_SETTINGS_SECRET_PROVIDER = 'google_secret_manager';
  process.env.PDM_SECRET_FINGERPRINT_PEPPER = 'synthetic-pg-test-pepper';
  process.env.PDM_DB_PROVIDER = 'postgres';
  process.env.PDM_POSTGRES_MAX_CONNECTIONS = '1';
  process.env.DEV010_N2_DATABASE_BOUNDARY = 'required';
  // A newly owned LOGIN inherits only runtime ACL. Never execute these service
  // transactions as postgres or depend on a connection-startup SET ROLE option.
  const settingsLogin = 'dev121_settings_' + crypto.randomBytes(8).toString('hex');
  const settingsPassword = crypto.randomBytes(24).toString('hex');
  assert.match(settingsLogin,/^dev121_settings_[a-f0-9]{16}$/u);
  assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[settingsLogin])).rowCount,0);
  await admin.query('CREATE ROLE '+settingsLogin+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+settingsPassword+"'");
  createdRoles.push(settingsLogin);
  await admin.query('GRANT jenfu_ai_pdm_runtime TO '+settingsLogin);
  await admin.query('REVOKE CONNECT ON DATABASE '+dbName+' FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE '+dbName+' TO '+settingsLogin);
  const settingsUrl = new URL(targetUrl);
  settingsUrl.username = settingsLogin;
  settingsUrl.password = settingsPassword;
  process.env.PDM_POSTGRES_URL = settingsUrl.toString();
  const { getAsyncDatabaseClient,closeAsyncDatabaseClient } = await import(pathToFileURL(path.join(root,'src/lib/db-async-provider.ts')));
  closeSettingsRuntime = closeAsyncDatabaseClient;
  const settingsClient = getAsyncDatabaseClient();
  const settingsAcl = await settingsClient.queryOne(`SELECT current_user AS role,
    pg_has_role(current_user,'jenfu_ai_pdm_runtime','USAGE') AS runtime_acl,
    has_schema_privilege(current_user,'ai_pdm_core','CREATE') AS can_create,
    rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
  assert.deepEqual(settingsAcl,{role:settingsLogin,runtime_acl:true,can_create:false,
    rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
  const { createSettingsSecretDraft,enqueueSettingsSecretProbe,activateSettingsSecretReference,revokeSettingsSecretReference,
    completeSettingsSecretProbe,resolveSettingsSecretProbeCredential } = await import(pathToFileURL(path.join(root,'src/lib/settings-secret-lifecycle.ts')));
  const { AsyncSettingsSecretRepository } = await import(pathToFileURL(path.join(root,'src/lib/repositories/settings-secret-async-repository.ts')));
  const repository = new AsyncSettingsSecretRepository(settingsClient);
  const managerSeconds = Math.floor(Date.now()/1000);
  const managerToken = issueJenfuPrincipalSession({ ...actor,authEpoch:0,accountLifecycleVersion:1,profileVersion:1,
    companyId:'company-jenfu',authenticatedAt:managerSeconds-30,assuranceLevel:'aal1',secondFactor:null,
    assurancePolicyHash:principalAssurancePolicyHash(trustPolicy),maxAgeSeconds:600 },keyRing,managerSeconds);
  const managerClaims = verifyJenfuPrincipalSession(managerToken,keyRing,{nowSeconds:managerSeconds});
  await appTransaction(snapshot => new JenfuPrincipalSessionRegistry(snapshot).register(managerClaims));
  const metadata = (action,operation) => ({ actor:{ principalId:actor.principalId,pdmUserId:actorProfile,
    organizationId:'company-jenfu',platformOrganizationId:null,roles:['pdm_admin'],scopes:['settings.secret.manage'],
    authProvider:'current_pdm_session',correlationId:operation,requestId:operation,
    authorizationActor:{ ...actor,localPrincipalId:actorProfile,companyId:'company-jenfu',sessionSchemaVersion:2 } },
    idempotencyKey:operation,principalRequest:{ token:managerToken,keyRing,trustPolicy,identityIssuer:actor.identityIssuer,
      database:settingsClient,nowSeconds:managerSeconds },principalAuthorization:{
      request:new Request('https://pdm.example.test/api/settings/secrets/solidworks_document_manager/'+action,
        {method:'POST',headers:{cookie:'pdm_session='+managerToken}}),
      routePath:'src/app/api/settings/secrets/[kind]/'+action+'/route.ts',method:'POST',permissionCode:'settings.secret.manage' } });
  const effects = async () => (await database.query(`SELECT
    (SELECT count(*)::integer FROM ai_pdm_core.secret_references) AS references,
    (SELECT count(*)::integer FROM ai_pdm_core.settings_secret_probe_jobs) AS jobs,
    (SELECT count(*)::integer FROM ai_pdm_core.setting_test_runs) AS tests,
    (SELECT count(*)::integer FROM ai_pdm_core.setting_activation_events) AS events,
    (SELECT count(*)::integer FROM ai_pdm_core.audit_logs) AS audit,
    (SELECT count(*)::integer FROM ai_pdm_core.platform_command_receipts) AS receipts,
    (SELECT count(*)::integer FROM ai_pdm_core.platform_outbox_events) AS outbox`)).rows[0];
  const syntheticValue = 'synthetic-pg-not-a-provider-key';
  const draft = await createSettingsSecretDraft({kind:'solidworks_document_manager',secretValue:syntheticValue},metadata('draft','settings-draft'));
  assert.equal(globalThis.__dev121SyntheticProviderWrites,1);
  const afterDraft = await effects();
  assert.deepEqual(await createSettingsSecretDraft({kind:'solidworks_document_manager',secretValue:syntheticValue},metadata('draft','settings-draft')),draft);
  assert.deepEqual(await effects(),afterDraft);
  assert.equal(globalThis.__dev121SyntheticProviderWrites,1);
  const material = (await database.query(`SELECT jsonb_agg(to_jsonb(row))::text AS material FROM
    (SELECT metadata_json FROM ai_pdm_core.secret_references UNION ALL SELECT response_json FROM ai_pdm_core.platform_command_receipts
      UNION ALL SELECT payload_json FROM ai_pdm_core.platform_outbox_events UNION ALL SELECT detail_json FROM ai_pdm_core.audit_logs) row`)).rows[0].material;
  assert.ok(!material.includes(syntheticValue));
  checks.push('actual secret draft command commits canonical receipt/outbox/audit with synthetic-only provider; exact replay does not repeat provider or DB effects');
  const providerRecheckBefore = await effects();
  const providerWritesBefore = globalThis.__dev121SyntheticProviderWrites;
  const withdrawnGrants = (await database.query(`SELECT jsonb_agg(to_jsonb(grant_row)) AS rows
    FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 grant_row WHERE principal_id=$1`,[actor.principalId])).rows[0].rows;
  assert.ok(Array.isArray(withdrawnGrants) && withdrawnGrants.length > 0);
  // An effective producer removes withdrawn rows; retaining an expired row in
  // this table fixture would instead test malformed authority/dependency failure.
  globalThis.__dev121BeforeSyntheticProviderReturn = () => database.query(
    'DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1',[actor.principalId]);
  try {
    await assert.rejects(createSettingsSecretDraft({kind:'solidworks_document_manager',secretValue:syntheticValue},metadata('draft','settings-draft-after-revoke')),
      error => error.code==='permission_not_granted' && jenfuEntitlementFailureResponse(error.code).status===403);
    assert.deepEqual(await effects(),providerRecheckBefore);
    assert.equal(globalThis.__dev121SyntheticProviderWrites,providerWritesBefore+1);
  } finally {
    delete globalThis.__dev121BeforeSyntheticProviderReturn;
    await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      SELECT * FROM jsonb_populate_recordset(NULL::orgmaster_contract.v_ai_pdm_principal_effective_grants_v4,$1::jsonb)`,[JSON.stringify(withdrawnGrants)]);
  }
  checks.push('fresh draft preflight then synthetic provider add then effective-grant withdrawal: actual command recheck denies typed403 with zero DB reference/receipt/outbox/audit; only unreferenced provider orphan remains');
  await assert.rejects(database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs
    (id,secret_reference_id,kind,status,created_by)
    VALUES ('old-writer-insert','secret-legacy','solidworks_document_manager','pending',$1)`,[actorProfile]),
  error => error.code==='23514' && error.message==='settings_probe_principal_required');
  // Ordinary legacy updates are preserved, but may never invent an initiator.
  await database.query("UPDATE ai_pdm_core.settings_secret_probe_jobs SET result_code='synthetic_legacy_held' WHERE id='probe-legacy'");
  const legacyBefore = (await database.query("SELECT to_jsonb(job) AS value FROM ai_pdm_core.settings_secret_probe_jobs job WHERE id='probe-legacy'")).rows[0].value;
  assert.equal(legacyBefore.result_code,'synthetic_legacy_held');
  assert.equal(legacyBefore.company_id,null);assert.equal(legacyBefore.initiator_principal_id,null);
  assert.equal(legacyBefore.initiator_profile_version,null);assert.equal(legacyBefore.purpose,null);
  // Reference creator provenance and pre078 queue provenance are separate fixtures.
  // Missing creator provenance is rejected without inventing a Principal or enqueuing.
  await database.query(`INSERT INTO ai_pdm_core.secret_references
    (id,kind,provider,vault_provider,lifecycle_status,version,created_by,created_at,metadata_json)
    VALUES ('secret-untrusted-creator','solidworks_document_manager','solidworks_document_manager',
      'google_secret_manager','draft',997,$1,clock_timestamp(),'{"companyId":"company-jenfu"}')`,[actorProfile]);
  const untrustedBefore=await effects();
  await assert.rejects(enqueueSettingsSecretProbe({secretReferenceId:'secret-untrusted-creator'},metadata('test','settings-untrusted-creator')),
    error=>error.code==='SECRET_REFERENCE_PROVENANCE_REQUIRED');
  assert.deepEqual(await effects(),untrustedBefore);
  const replacement = await enqueueSettingsSecretProbe({secretReferenceId:'secret-legacy'},metadata('test','settings-legacy-new-typed'));
  await assert.rejects(database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs
    (id,secret_reference_id,kind,status,created_by,company_id,initiator_principal_id,initiator_profile_version,purpose)
    VALUES ('typed-duplicate',$1,'solidworks_document_manager','pending',$2,'company-jenfu',$3,1,'settings_secret_probe')`,
  ['secret-legacy',actorProfile,actor.principalId]),error => error.code==='23505');
  const replacementWorker = {kind:'workload',id:'settings-synthetic-worker',purposes:['settings_secret_probe'],capabilities:['solidworks_document_manager']};
  assert.equal((await repository.claimProbeJob(replacementWorker.id,new Date().toISOString())).id,replacement.id);
  await completeSettingsSecretProbe({probeJobId:replacement.id,worker:replacementWorker,status:'failed',resultCode:'synthetic_legacy_replacement',readerVersion:'synthetic'});
  assert.deepEqual((await database.query("SELECT to_jsonb(job) AS value FROM ai_pdm_core.settings_secret_probe_jobs job WHERE id='probe-legacy'")).rows[0].value,legacyBefore);
  checks.push('actual078 rejects old-writer INSERT, preserves legacy non-actor UPDATE, holds NULL row without reserving typed slot; normal same-reference typed enqueue/claim and typed uniqueness hold');
  // A draft creator and queue tester are different synthetic existing profiles.
  await database.query(`INSERT INTO ai_pdm_core.secret_references SELECT 'secret-other-creator',kind,provider,display_name,vault_provider,
    vault_secret_id,masked_hint,fingerprint,'draft',100,$2,clock_timestamp(),NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,metadata_json
    FROM ai_pdm_core.secret_references WHERE id=$1`,[draft.id,first.pdmUserId]);
  const queued = await enqueueSettingsSecretProbe({secretReferenceId:'secret-other-creator'},metadata('test','settings-queue'));
  assert.equal(queued.createdBy,actorProfile);
  assert.notEqual(queued.createdBy,first.pdmUserId);
  assert.equal(queued.companyId,'company-jenfu');assert.equal(queued.initiatorPrincipalId,actor.principalId);
  assert.equal(queued.initiatorProfileVersion,1);assert.equal(queued.purpose,'settings_secret_probe');
  const queueCounts = await effects();
  assert.deepEqual(await enqueueSettingsSecretProbe({secretReferenceId:'secret-other-creator'},metadata('test','settings-queue')),JSON.parse(JSON.stringify(queued)));
  assert.deepEqual(await effects(),queueCounts);
  for (const assignment of ["company_id='wrong-company'","created_by='wrong-profile'","initiator_principal_id='wrong-principal'",
    'initiator_profile_version=2',"purpose='preview_jobs'","secret_reference_id='secret-legacy'","kind='other-kind'"]) {
    await assert.rejects(database.query('UPDATE ai_pdm_core.settings_secret_probe_jobs SET '+assignment+' WHERE id=$1',[queued.id]),/settings_probe_initiator_immutable/u);
  }
  for (const [company,profileId,principalId] of [['wrong-company',actorProfile,actor.principalId],['company-jenfu',first.pdmUserId,actor.principalId]]) {
    await assert.rejects(database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs
      (id,secret_reference_id,kind,status,created_by,company_id,initiator_principal_id,initiator_profile_version,purpose)
      VALUES ($1,$2,'solidworks_document_manager','failed',$3,$4,$5,1,'settings_secret_probe')`,
    ['forged-'+crypto.randomUUID(),draft.id,profileId,company,principalId]),error => error.code === '23503');
  }
  for (const [principalId,version,purpose] of [[null,1,'settings_secret_probe'],[actor.principalId,0,'settings_secret_probe'],[actor.principalId,1,'preview_jobs']]) {
    await assert.rejects(database.query(`INSERT INTO ai_pdm_core.settings_secret_probe_jobs
      (id,secret_reference_id,kind,status,created_by,company_id,initiator_principal_id,initiator_profile_version,purpose)
      VALUES ($1,$2,'solidworks_document_manager','failed',$3,'company-jenfu',$4,$5,$6)`,
    ['untyped-'+crypto.randomUUID(),draft.id,actorProfile,principalId,version,purpose]),error => error.code==='23514');
  }
  const worker = {kind:'workload',id:'settings-synthetic-worker',purposes:['settings_secret_probe'],capabilities:['solidworks_document_manager']};
  const claimed = await repository.claimProbeJob(worker.id,new Date().toISOString());
  assert.equal(claimed.id,queued.id);assert.equal(claimed.initiatorPrincipalId,actor.principalId);
  assert.equal(await repository.heartbeatProbeJob(queued.id,'another-worker',new Date().toISOString()),false);
  assert.equal(await repository.heartbeatProbeJob(queued.id,worker.id,new Date().toISOString()),true);
  const beforeWorker = await effects();
  const completeInput = {probeJobId:queued.id,worker,status:'failed',resultCode:'synthetic_probe_failure',readerVersion:'synthetic-reader'};
  await assert.rejects(completeSettingsSecretProbe({...completeInput,worker:{...worker,id:'another-worker'}}),error => error.code === 'SECRET_PROBE_JOB_LOCKED');
  await assert.rejects(completeSettingsSecretProbe({...completeInput,worker:{...worker,purposes:['preview_jobs']}}),error => error.code === 'WORKLOAD_FORBIDDEN');
  assert.deepEqual(await effects(),beforeWorker);
  const failedRun = await completeSettingsSecretProbe(completeInput);
  assert.equal(failedRun.testedBy,actorProfile);
  assert.deepEqual(JSON.parse(failedRun.metadataJson).initiator,{kind:'human',principalId:actor.principalId,profileVersion:1});
  assert.deepEqual(JSON.parse(failedRun.metadataJson).securityActor,{kind:'workload',id:worker.id,purpose:'settings_secret_probe'});
  assert.equal((await repository.getReferenceById('secret-other-creator')).lifecycleStatus,'draft');
  checks.push('actual enqueue/replay preserves tester separate from draft creator; native078 freezes full provenance tuple and rejects crosscompany/profile FK; actual claim/heartbeat/failed completion retain technical executor plus human initiator');
  const ownProbe = await enqueueSettingsSecretProbe({secretReferenceId:draft.id},metadata('test','settings-queue-activate'));
  assert.equal((await repository.claimProbeJob(worker.id,new Date().toISOString())).id,ownProbe.id);
  await completeSettingsSecretProbe({...completeInput,probeJobId:ownProbe.id,status:'passed',resultCode:null});
  const activatedSecret = await activateSettingsSecretReference({secretReferenceId:draft.id},metadata('activate','settings-activate'));
  assert.equal(activatedSecret.lifecycleStatus,'active');
  assert.equal((await revokeSettingsSecretReference({secretReferenceId:draft.id,reason:'synthetic revoke'},metadata('revoke','settings-revoke'))).lifecycleStatus,'revoked');
  for (const [operation,commandName,action] of [['settings-draft','create_draft','SettingsSecretDraftCreated'],
    ['settings-queue','probe.enqueue','SettingsSecretProbeQueued'],['settings-activate','activate','SettingsSecretActivated'],['settings-revoke','revoke','SettingsSecretRevoked']]) {
    const receipt = (await database.query('SELECT * FROM ai_pdm_core.platform_command_receipts WHERE idempotency_key=$1',[operation])).rows[0];
    const event = (await database.query('SELECT * FROM ai_pdm_core.platform_outbox_events WHERE idempotency_key=$1',[operation])).rows[0];
    assert.equal(receipt.command_name,'pdm.settings_secret.'+commandName);assert.equal(receipt.command_status,'completed');
    for (const row of [receipt,event]) {assert.equal(row.principal_id,actor.principalId);assert.equal(row.actor_id,actorProfile);assert.equal(row.company_id,'company-jenfu');assert.equal(row.platform_principal_id,null);}
    assert.deepEqual(JSON.parse(receipt.response_json).actorBinding,{version:2,actorKind:'human',principalId:actor.principalId,companyId:'company-jenfu'});
    const audits = (await database.query('SELECT * FROM ai_pdm_core.audit_logs WHERE action=$1',[action])).rows;
    assert.ok(audits.length);assert.ok(audits.every(row => row.actor_id===actorProfile && row.company_id==='company-jenfu' &&
      JSON.parse(row.detail_json).securityActor.principalId===actor.principalId));
  }
  checks.push('four actual human commands commit canonical Principal/profile/company receipt and outbox plus Principal domain audit; activation/revocation reload persists and never aliases legacy Platform UID');
  const deniedBefore = await effects();
  for (const forgedActor of [{organizationId:'wrong-company'},{pdmUserId:first.pdmUserId},{principalId:target}]) {
    const bad = metadata('test','settings-forged-'+crypto.randomUUID());bad.actor={...bad.actor,...forgedActor};
    await assert.rejects(enqueueSettingsSecretProbe({secretReferenceId:'secret-other-creator'},bad));
  }
  await database.query('UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 SET scope_key=$2 WHERE principal_id=$1',[actor.principalId,'wrong-company']);
  try { await assert.rejects(enqueueSettingsSecretProbe({secretReferenceId:'secret-other-creator'},metadata('test','settings-scope-denied'))); }
  finally { await database.query('UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 SET scope_key=$2 WHERE principal_id=$1',[actor.principalId,'company-jenfu']); }
  await assert.rejects(activateSettingsSecretReference({secretReferenceId:'secret-legacy-passed'},metadata('activate','legacy-activate')),
    error => error.code==='SECRET_PROBE_PRINCIPAL_PROVENANCE_REQUIRED');
  await database.query("UPDATE ai_pdm_core.settings_secret_probe_jobs SET status='running',locked_by=$1,attempt_count=2,updated_at=clock_timestamp()-interval '2 minutes' WHERE id='probe-legacy'",[worker.id]);
  assert.equal(await repository.claimProbeJob(worker.id,new Date().toISOString()),null);
  assert.equal((await repository.getProbeJobById('probe-legacy')).status,'running');
  assert.equal(await repository.heartbeatProbeJob('probe-legacy',worker.id,new Date().toISOString()),false);
  await assert.rejects(completeSettingsSecretProbe({...completeInput,probeJobId:'probe-legacy'}),error => error.code==='SECRET_PROBE_PRINCIPAL_PROVENANCE_REQUIRED');
  await assert.rejects(resolveSettingsSecretProbeCredential('probe-legacy',worker),error => error.code==='SECRET_PROBE_PRINCIPAL_PROVENANCE_REQUIRED');
  assert.deepEqual(await effects(),deniedBefore);
  checks.push('actual command rejects forged Principal/profile/company and out-of-company published grant with zero effects; pre078 NULL job cannot claim/heartbeat/complete/credential/activate or be repaired from creator');
  const staleProbe = await enqueueSettingsSecretProbe({secretReferenceId:'secret-other-creator'},metadata('test','settings-stale-probe'));
  await repository.claimProbeJob(worker.id,new Date().toISOString());
  await database.query('UPDATE ai_pdm_core.settings_secret_probe_jobs SET updated_at=clock_timestamp()-interval \'2 minutes\' WHERE id=$1',[staleProbe.id]);
  const staleBefore = await effects();
  assert.equal(await repository.heartbeatProbeJob(staleProbe.id,worker.id,new Date().toISOString()),false);
  await assert.rejects(completeSettingsSecretProbe({...completeInput,probeJobId:staleProbe.id}),error => error.code==='SECRET_PROBE_JOB_LOCKED');
  assert.deepEqual(await effects(),staleBefore);
  await database.query('UPDATE ai_pdm_core.settings_secret_probe_jobs SET updated_at=clock_timestamp() WHERE id=$1',[staleProbe.id]);
  await revokeSettingsSecretReference({secretReferenceId:'secret-other-creator'},metadata('revoke','settings-revoke-inflight'));
  const revokedBefore = await effects();
  await assert.rejects(completeSettingsSecretProbe({...completeInput,probeJobId:staleProbe.id,status:'passed'}),error => error.code==='SECRET_REFERENCE_NOT_TESTABLE');
  await assert.rejects(resolveSettingsSecretProbeCredential(staleProbe.id,worker),error => error.code==='SECRET_PROVIDER_NOT_READABLE');
  assert.deepEqual(await effects(),revokedBefore);
  assert.equal((await repository.getReferenceById('secret-other-creator')).lifecycleStatus,'revoked');
  checks.push('expired holder has no heartbeat/completion; revoked reference blocks credential and late passing callback with zero effects and cannot resurrect');
  // SQL failures after business writes must roll back the actual shared transaction.
  await database.query(`CREATE FUNCTION ai_pdm_core.settings_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN RAISE EXCEPTION 'synthetic_settings_audit_failure'; END; $fixture$;
    CREATE TRIGGER settings_test_audit_failure BEFORE INSERT ON ai_pdm_core.audit_logs
      FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.settings_test_audit_failure();`);
  const rollbackBefore = await effects();
  const rollbackProviderBefore = globalThis.__dev121SyntheticProviderWrites;
  try {
    await assert.rejects(createSettingsSecretDraft({kind:'solidworks_document_manager',secretValue:syntheticValue},metadata('draft','settings-draft-rollback')),/synthetic_settings_audit_failure/u);
    assert.deepEqual(await effects(),rollbackBefore);
  } finally { await database.query('DROP TRIGGER settings_test_audit_failure ON ai_pdm_core.audit_logs'); }
  assert.equal(globalThis.__dev121SyntheticProviderWrites,rollbackProviderBefore+1,'failed commit may orphan only synthetic provider version, never active DB reference');
  const rollbackReference = await createSettingsSecretDraft({kind:'solidworks_document_manager',secretValue:syntheticValue},metadata('draft','settings-draft-for-worker-rollback'));
  await database.query(`CREATE TRIGGER settings_test_audit_failure BEFORE INSERT ON ai_pdm_core.audit_logs
    FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.settings_test_audit_failure();`);
  const queueRollbackBefore = await effects();
  try {
    await assert.rejects(enqueueSettingsSecretProbe({secretReferenceId:rollbackReference.id},metadata('test','settings-queue-rollback')),/synthetic_settings_audit_failure/u);
    assert.deepEqual(await effects(),queueRollbackBefore);
  } finally { await database.query('DROP TRIGGER settings_test_audit_failure ON ai_pdm_core.audit_logs'); }
  const rollbackJob = await enqueueSettingsSecretProbe({secretReferenceId:rollbackReference.id},metadata('test','settings-queue-for-worker-rollback'));
  assert.equal((await repository.claimProbeJob(worker.id,new Date().toISOString())).id,rollbackJob.id);
  await database.query(`CREATE TRIGGER settings_test_audit_failure BEFORE INSERT ON ai_pdm_core.audit_logs
    FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.settings_test_audit_failure();`);
  const workerRollbackBefore = await effects();
  try {
    await assert.rejects(completeSettingsSecretProbe({...completeInput,probeJobId:rollbackJob.id,status:'passed'}),/synthetic_settings_audit_failure/u);
    assert.deepEqual(await effects(),workerRollbackBefore);
    assert.equal((await repository.getProbeJobById(rollbackJob.id)).status,'running');
    assert.equal((await repository.getReferenceById(rollbackReference.id)).lifecycleStatus,'draft');
  } finally { await database.query('DROP TRIGGER settings_test_audit_failure ON ai_pdm_core.audit_logs'); }
  checks.push('actual SQL audit failure rolls back human draft and queue/event/receipt/outbox atomically plus worker completion/test/reference/event/audit; provider orphan stays unreferenced');
  for (const file of ['src/lib/settings-secret-lifecycle.ts','src/lib/repositories/settings-secret-async-repository.ts',
    'src/lib/platform-command-service.ts','src/lib/jenfu-principal-request-guard.ts']) {
    sourceProof.push({path:file,sourceSha256:sha(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n')),
      scope:'actual consumer runtime; only provider I/O mocked, identity/grant/session fixtures synthetic'});
  }

  // Existing 15 cases are preserved. Resource/provider facts and signed sessions
  // remain synthetic; mounted routes/guard/kernel/binder/repos execute unchanged.
  assert.equal(checks.length,15);
  const initialSchema=fs.readFileSync(path.join(root,'db/postgres/001_initial_schema.sql'),'utf8').replaceAll('\r\n','\n');
  const extractTable=(first,last)=>{
    const start=initialSchema.indexOf(first),end=initialSchema.indexOf(last,start);
    assert.ok(start>=0 && end>start);return initialSchema.slice(start,end);
  };
  const shareDdl=extractTable('CREATE TABLE IF NOT EXISTS release_packages (','CREATE TABLE IF NOT EXISTS procurement_sync_runs (')+
    extractTable('CREATE TABLE IF NOT EXISTS supplier_portal_responses (','CREATE TABLE IF NOT EXISTS discussion_comments (');
  await database.query(`CREATE TABLE ai_pdm_core.submissions (
    id text PRIMARY KEY,company_id text NOT NULL REFERENCES ai_pdm_core.companies(id),
    submitted_by text REFERENCES ai_pdm_core.users(id),status text NOT NULL);
    INSERT INTO ai_pdm_core.companies VALUES ('company-share-other');`);
  await database.query('BEGIN');
  try {await database.query('SET LOCAL search_path=ai_pdm_core,public');await database.query(shareDdl);await database.query('COMMIT');}
  catch(error){await database.query('ROLLBACK');throw error;}
  sourceProof.push({path:'db/postgres/001_initial_schema.sql',sourceSha256:sha(initialSchema),executedFunctionSha256:sha(shareDdl),
    scope:'unchanged release/share/response table DDL only under own search_path; minimal submissions synthetic, not full migration suite'});
  await database.query(`GRANT SELECT ON ai_pdm_core.submissions,ai_pdm_core.release_packages,ai_pdm_core.supplier_portal_responses TO jenfu_ai_pdm_runtime;
    GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.readonly_shares TO jenfu_ai_pdm_runtime;`);
  const shareIdentity={principalId:'principal-share-manager',employeeId:'employee-share-manager',
    identityIssuer:'https://securetoken.google.com/dev121-share-fixture',identitySubject:'subject-share-manager'};
  const shareProfile='profile-share-manager';
  await database.query(`INSERT INTO ai_pdm_core.users(id,company_id,display_name,role)
    VALUES ($1,'company-jenfu','Synthetic share manager','Admin')`,[shareProfile]);
  await database.query(`INSERT INTO ai_pdm_core.principal_accounts
    (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
    VALUES ($1,$2,'company-jenfu',$3,'human_personal','active',1,1,true,'aal1')`,[shareIdentity.principalId,shareProfile,shareIdentity.employeeId]);
  await database.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
    VALUES ('organization.active-principal.v1',$1,$2,$3,$4,'active','human_personal',7,$5::timestamptz)`,
    [shareIdentity.identityIssuer,shareIdentity.identitySubject,shareIdentity.principalId,shareIdentity.employeeId,at]);
  await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    VALUES ('jenfu.orgmaster.ai-pdm-principal-grants.v4','ai-pdm',$1,$2,'share-grant-publication',7,'share-manager-assignment',
      'role-pdm-admin','pdm_admin',$3,'employee',NULL,'direct',NULL,'workspace','company-jenfu',clock_timestamp()-interval '1 minute',NULL,$4::timestamptz)`,
    [shareIdentity.principalId,shareIdentity.employeeId,catalog.catalogVersion,at]);
  await database.query('INSERT INTO platform_contract.principal_state_fixture VALUES ($1,0,NULL)',[shareIdentity.principalId]);
  await database.query(`INSERT INTO ai_pdm_core.submissions(id,company_id,submitted_by,status) VALUES
    ('share-own','company-jenfu',$1,'Released'),('share-other','company-share-other',$1,'Released'),
    ('share-draft','company-jenfu',$1,'Draft'),('share-no-package','company-jenfu',$1,'Released')`,[shareProfile]);
  await database.query(`INSERT INTO ai_pdm_core.release_packages(id,submission_id,package_filename,local_path,sha256,file_size,manifest_json,created_by)
    VALUES ('share-package-own','share-own','synthetic.zip','synthetic-no-file',$1,0,'{}',$2),
      ('share-package-other','share-other','synthetic.zip','synthetic-no-file',$1,0,'{}',$2)`,[sha('synthetic-package-no-bytes'),shareProfile]);
  await database.query(`INSERT INTO ai_pdm_core.readonly_shares(id,submission_id,token_hash,label,expires_at,created_by)
    VALUES ('share-foreign-existing','share-other',$1,'Synthetic foreign share',clock_timestamp()+interval '1 day',$2)`,
    [sha('synthetic-foreign-no-bearer'),shareProfile]);
  Object.assign(process.env,{PDM_AUTH_MODE:'firebase_bff',PDM_JENFU_PLATFORM_AUTH_MODE:'on',PDM_JENFU_ENTITLEMENT_MODE:'enforce',
    JENFU_FIREBASE_PROJECT_ID:'dev121-share-fixture',PDM_FIREBASE_PROJECT_ID:'dev121-share-fixture',
    JENFU_IDENTITY_ISSUER:shareIdentity.identityIssuer,JENFU_IDENTITY_AUDIENCE:'dev121-share-fixture',
    PDM_SESSION_ISSUER:keyRing.issuer,PDM_SESSION_AUDIENCE:keyRing.audience,
    PDM_SESSION_CURRENT_KEY_ID:keyRing.currentKeyId,PDM_SESSION_CURRENT_SECRET:keyRing.keys.fixture,
    PDM_TRUST_GOOGLE_WORKSPACE_MFA:'false',PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED:'true',PDM_GOOGLE_WORKSPACE_DOMAINS:'example.test'});
  delete process.env.PDM_SESSION_PREVIOUS_KEY_ID;delete process.env.PDM_SESSION_PREVIOUS_SECRET;
  const shareSeconds=Math.floor(Date.now()/1000);
  const shareSession=issueJenfuPrincipalSession({...shareIdentity,authEpoch:0,accountLifecycleVersion:1,profileVersion:1,
    companyId:'company-jenfu',authenticatedAt:shareSeconds-30,assuranceLevel:'aal1',secondFactor:null,
    assurancePolicyHash:principalAssurancePolicyHash(trustPolicy),maxAgeSeconds:600},keyRing,shareSeconds);
  await settingsClient.transaction(snapshot=>new JenfuPrincipalSessionRegistry(snapshot)
    .register(verifyJenfuPrincipalSession(shareSession,keyRing,{nowSeconds:shareSeconds})),{isolationLevel:'serializable',readOnly:false});
  const {POST:sharePost}=await import(pathToFileURL(path.join(root,'src/app/api/submissions/[id]/shares/route.ts')));
  const {PATCH:sharePatch}=await import(pathToFileURL(path.join(root,'src/app/api/submissions/[id]/shares/[shareId]/route.ts')));
  const {executePdmCommandWithOutbox}=await import(pathToFileURL(path.join(root,'src/lib/platform-command-service.ts')));
  const {createPlatformActorContext,createPdmCommand}=await import(pathToFileURL(path.join(root,'src/lib/platform-command.ts')));
  const {AsyncReleaseRepository}=await import(pathToFileURL(path.join(root,'src/lib/repositories/release-async-repository.ts')));
  const shareBody={label:'Synthetic Principal share',days:14};
  const shareRequest=(method,submissionId,operation,shareId,body=shareBody)=>new Request(
    'https://pdm.example.test/api/submissions/'+submissionId+'/shares'+(shareId?'/'+shareId:''),
    {method,headers:{cookie:'pdm_session='+shareSession,'content-type':'application/json','idempotency-key':operation,'x-request-id':operation},
      ...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const publicCreate=(operation,submissionId='share-own',body=shareBody)=>sharePost(
    shareRequest('POST',submissionId,operation,undefined,body),{params:Promise.resolve({id:submissionId})});
  const publicRevoke=(operation,shareId,submissionId='share-own')=>sharePatch(
    shareRequest('PATCH',submissionId,operation,shareId),{params:Promise.resolve({id:submissionId,shareId})});
  // Full row snapshots detect denied UPDATEs as well as INSERTs and duplicates.
  const shareSnapshot=async()=>{
    const result={};
    for(const table of ['readonly_shares','platform_command_receipts','platform_outbox_events','audit_logs'])
      result[table]=(await database.query(`SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) AS rows FROM ai_pdm_core.${table} row`)).rows[0].rows;
    return result;
  };
  const shareEvidence=async(operation,commandName,eventType,action,shareId,forbidden=[])=>{
    const receipts=(await database.query('SELECT * FROM ai_pdm_core.platform_command_receipts WHERE idempotency_key=$1',[operation])).rows;
    const events=(await database.query('SELECT * FROM ai_pdm_core.platform_outbox_events WHERE idempotency_key=$1',[operation])).rows;
    assert.equal(receipts.length,1);assert.equal(events.length,1);
    const receipt=receipts[0],event=events[0];
    assert.equal(receipt.command_name,commandName);assert.equal(receipt.command_status,'completed');
    assert.equal(event.event_type,eventType);assert.equal(event.aggregate_id,shareId);assert.equal(event.delivery_status,'pending');
    for(const row of [receipt,event]){
      assert.equal(row.principal_id,shareIdentity.principalId);assert.equal(row.actor_id,shareProfile);assert.equal(row.company_id,'company-jenfu');
      assert.equal(row.platform_principal_id,null);assert.equal(row.platform_organization_id,null);
    }
    const envelope=JSON.parse(receipt.response_json);
    assert.deepEqual(envelope.actorBinding,{version:2,actorKind:'human',principalId:shareIdentity.principalId,companyId:'company-jenfu'});
    assert.equal(envelope.result.share.id,shareId);
    const audits=(await database.query(`SELECT * FROM ai_pdm_core.audit_logs WHERE action=$1 AND detail_json::jsonb->>'shareId'=$2`,[action,shareId])).rows;
    assert.equal(audits.length,1);assert.equal(audits[0].actor_id,shareProfile);assert.equal(audits[0].company_id,'company-jenfu');
    assert.equal(audits[0].scope_kind,'tenant');assert.equal(JSON.parse(audits[0].detail_json).securityPrincipalId,shareIdentity.principalId);
    const material=JSON.stringify([receipt,event,audits[0]]);
    for(const secret of forbidden) assert.ok(!material.includes(secret),'bearer token/hash excluded from receipt/outbox/audit');
  };
  const beforeCreate=await shareSnapshot(),createdResponse=await publicCreate('share-create');
  assert.equal(createdResponse.status,201);
  const createdShare=await createdResponse.json();
  assert.equal(createdShare.share.submission_id,'share-own');assert.equal(createdShare.share.status,'active');
  const createdRow=(await database.query('SELECT * FROM ai_pdm_core.readonly_shares WHERE id=$1',[createdShare.share.id])).rows[0];
  assert.equal(createdRow.token_hash,sha(createdShare.token));
  const afterCreate=await shareSnapshot();
  for(const table of Object.keys(beforeCreate)) assert.equal(afterCreate[table].length,beforeCreate[table].length+1);
  await shareEvidence('share-create','pdm.submission_share.create','pdm.submission_share.created','ReadonlyShareCreated',createdShare.share.id,[createdShare.token,createdRow.token_hash]);
  const creationReplay=await publicCreate('share-create');
  assert.equal(creationReplay.status,409);assert.deepEqual(await creationReplay.json(),{code:'share_creation_result_already_consumed'});
  assert.deepEqual(await shareSnapshot(),afterCreate);
  const changedReplay=await publicCreate('share-create','share-own',{...shareBody,label:'Changed request'});
  assert.equal(changedReplay.status,503);assert.deepEqual(await changedReplay.json(),{code:'principal_dependency_unavailable'});
  assert.deepEqual(await shareSnapshot(),afterCreate);
  checks.push('actual mounted POST commits one Principal/company share/receipt/outbox/tenant audit without bearer material; stable request replay is consumed409 and changed request has zero effects');
  const revokedResponse=await publicRevoke('share-revoke',createdShare.share.id);
  assert.equal(revokedResponse.status,200);
  const revokedShare=await revokedResponse.json();assert.equal(revokedShare.share.status,'revoked');
  assert.equal((await database.query('SELECT revoked_by FROM ai_pdm_core.readonly_shares WHERE id=$1',[createdShare.share.id])).rows[0].revoked_by,shareProfile);
  await shareEvidence('share-revoke','pdm.submission_share.revoke','pdm.submission_share.revoked','ReadonlyShareRevoked',createdShare.share.id);
  const afterRevoke=await shareSnapshot(),revokeReplay=await publicRevoke('share-revoke',createdShare.share.id);
  assert.equal(revokeReplay.status,200);assert.deepEqual(await revokeReplay.json(),revokedShare);assert.deepEqual(await shareSnapshot(),afterRevoke);
  checks.push('actual mounted PATCH revokes/reloads with canonical Principal receipt/outbox/tenant audit; exact replay has no extra effects');
  const directCommand=(operation,{submissionId='share-own',shareId,mutate}={})=>{
    const revoke=shareId!==undefined,method=revoke?'PATCH':'POST';
    const payload=revoke?{submissionId,shareId}:{submissionId,...shareBody};
    const actorContext=createPlatformActorContext({pdmUserId:shareProfile,organizationId:'company-jenfu',requestId:operation,
      authorizationActor:{...shareIdentity,localPrincipalId:shareProfile,companyId:'company-jenfu',sessionSchemaVersion:2}});
    const input={client:settingsClient,command:createPdmCommand({commandName:revoke?'pdm.submission_share.revoke':'pdm.submission_share.create',
      idempotencyKey:operation,actor:actorContext,payload}),
      principalRequest:{token:shareSession,keyRing,trustPolicy,identityIssuer:shareIdentity.identityIssuer,database:settingsClient},
      principalAuthorization:{request:shareRequest(method,submissionId,operation,shareId),method,permissionCode:'submission.share',
        routePath:revoke?'src/app/api/submissions/[id]/shares/[shareId]/route.ts':'src/app/api/submissions/[id]/shares/route.ts',
        resourceBinding:{kind:'submission_share',submissionId,...(revoke?{shareId}:{})}},
      execute:async(client,_decision,verifiedPrincipal)=>{
        assert.ok(verifiedPrincipal);
        const repo=new AsyncReleaseRepository(client),principalAudit={principalId:verifiedPrincipal.session.principalId,companyId:verifiedPrincipal.profile.companyId};
        const share=revoke?await repo.revokeReadonlyShare({submissionId,shareId,revokedBy:verifiedPrincipal.profile.pdmUserId,principalAudit}):
          await repo.createReadonlyShare({submissionId,tokenHash:sha('synthetic-direct-'+operation),label:shareBody.label,
            expiresAt:new Date(Date.now()+86400000).toISOString(),createdBy:verifiedPrincipal.profile.pdmUserId,principalAudit});
        assert.ok(share);return {share};
      },event:({share})=>({aggregateType:'readonly_share',aggregateId:share.id,eventType:revoke?'pdm.submission_share.revoked':'pdm.submission_share.created',
        payload:{submissionId,shareId:share.id}}),idempotencyPayload:payload,serializable:true};
    mutate?.(input);return executePdmCommandWithOutbox(input);
  };
  const forgeryBefore=await shareSnapshot();
  const forgeries=[
    [input=>{input.command.actor.principalId='forged-principal';},'PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID'],
    [input=>{input.command.actor.pdmUserId=actorProfile;},'PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID'],
    [input=>{input.command.actor.organizationId='company-share-other';},'PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID'],
    [input=>{input.principalAuthorization.resourceBinding.submissionId='share-other';},'PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID'],
    [input=>{input.command.payload.submissionId='share-other';},'PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID'],
    [input=>{input.principalAuthorization.resourceBinding.shareId='share-foreign-existing';},'PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID'],
    [input=>{input.command.commandName='pdm.submission_share.other';},'PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID'],
    [input=>{input.principalAuthorization.additionalPermissionCodes=['submission.view'];},'PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID']
  ];
  for(const [index,[mutate,message]] of forgeries.entries()){
    await assert.rejects(directCommand('share-forged-'+index,{mutate}),error=>error.message===message);assert.deepEqual(await shareSnapshot(),forgeryBefore);
  }
  await assert.rejects(directCommand('share-forged-revoke',{shareId:createdShare.share.id,
    mutate:input=>{input.principalAuthorization.resourceBinding.shareId='share-foreign-existing';}}),
    error=>error.message==='PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID');
  assert.deepEqual(await shareSnapshot(),forgeryBefore);
  checks.push('actual kernel rejects forged Principal/profile/company/path/payload/resource and broad company-scope dispatch before any share/receipt/outbox/audit effects');
  const resourceBefore=await shareSnapshot();
  for(const [id,status] of [['share-other',403],['share-draft',409],['share-no-package',409]]){
    assert.equal((await publicCreate('share-resource-'+id,id)).status,status);assert.deepEqual(await shareSnapshot(),resourceBefore);
  }
  assert.equal((await publicRevoke('share-foreign-revoke','share-foreign-existing')).status,403);assert.deepEqual(await shareSnapshot(),resourceBefore);
  checks.push('actual mounted routes reject foreign-company submission/share and non-Released or missing package with zero effects; no bearer/profile/local-role fallback');
  const shareGrants=(await database.query(`SELECT jsonb_agg(to_jsonb(grant_row)) AS rows
    FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 grant_row WHERE principal_id=$1`,[shareIdentity.principalId])).rows[0].rows;
  const restoreGrants=async()=>{
    await database.query('DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1',[shareIdentity.principalId]);
    await database.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      SELECT * FROM jsonb_populate_recordset(NULL::orgmaster_contract.v_ai_pdm_principal_effective_grants_v4,$1::jsonb)`,[JSON.stringify(shareGrants)]);
  };
  const permissionBefore=await shareSnapshot();
  const denyBoth=async suffix=>{
    for(const response of [await publicCreate('share-denied-'+suffix),await publicRevoke('share-denied-'+suffix,createdShare.share.id)]) assert.equal(response.status,403);
    assert.deepEqual(await shareSnapshot(),permissionBefore);
    assert.equal((await publicCreate('share-create')).status,403,'current permission precedes completed receipt replay');assert.deepEqual(await shareSnapshot(),permissionBefore);
  };
  try{
    await database.query('UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 SET scope_key=$2 WHERE principal_id=$1',[shareIdentity.principalId,'company-share-other']);
    await denyBoth('scope');await restoreGrants();
    await database.query("UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 SET stable_role_id='role-rd',role_code='rd' WHERE principal_id=$1",[shareIdentity.principalId]);
    await denyBoth('role');await restoreGrants();
    await database.query('DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 WHERE principal_id=$1',[shareIdentity.principalId]);await denyBoth('withdrawn');
  }finally{await restoreGrants();}
  checks.push('current grant scope/role/full withdrawal deny both mounted commands and completed-receipt replay with zero effects despite local Admin; exact synthetic producer rows restored');
  const rollbackResponse=await publicCreate('share-rollback-target');assert.equal(rollbackResponse.status,201);
  const rollbackShare=(await rollbackResponse.json()).share;
  for(const [table,point] of [['audit_logs','audit'],['platform_outbox_events','outbox']]){
    const name='share_test_'+point+'_failure';
    await database.query(`CREATE FUNCTION ai_pdm_core.${name}() RETURNS trigger LANGUAGE plpgsql AS $fixture$
      BEGIN RAISE EXCEPTION 'synthetic_share_${point}_failure'; END; $fixture$;
      CREATE TRIGGER ${name} BEFORE INSERT ON ai_pdm_core.${table} FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.${name}();`);
    const rollbackState=await shareSnapshot();
    try{
      // Exact SQL cause proves the writer reached the injected failure; generic
      // preflight denial is not considered successful transaction rollback.
      for(const [suffix,options] of [['create',{}],['revoke',{shareId:rollbackShare.id}]]){
        await assert.rejects(directCommand('share-rollback-'+point+'-'+suffix,options),error=>error.message==='synthetic_share_'+point+'_failure');
        assert.deepEqual(await shareSnapshot(),rollbackState);
      }
      const response=await publicRevoke('share-rollback-public-'+point,rollbackShare.id);
      assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'principal_dependency_unavailable'});assert.deepEqual(await shareSnapshot(),rollbackState);
      assert.equal((await database.query('SELECT revoked_at FROM ai_pdm_core.readonly_shares WHERE id=$1',[rollbackShare.id])).rows[0].revoked_at,null);
    }finally{await database.query(`DROP TRIGGER ${name} ON ai_pdm_core.${table}`);}
  }
  checks.push('actual SQL audit/outbox failure rolls back create/revoke, receipt and row updates atomically; public failure stays503 and active share remains active');
  for(const file of ['src/app/api/submissions/[id]/shares/route.ts','src/app/api/submissions/[id]/shares/[shareId]/route.ts',
    'src/lib/principal-readonly-share-command.ts','src/lib/principal-readonly-share.ts','src/lib/readonly-share-async.ts',
    'src/lib/platform-command.ts','src/lib/repositories/release-async-repository.ts','config/access-control/jenfu-route-permission-map.v2.json'])
    sourceProof.push({path:file,sourceSha256:sha(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n')),
      scope:file==='src/lib/principal-readonly-share.ts' ? 'management route imports this read helper only; share GET/package consumer not exercised by this fixture' :
        'actual mounted share management route/command/repository, util or policy; synthetic producer/session/resource, real runtime ACL and PG transactions'});

} finally {
  await closeSettingsRuntime?.();
  await appDatabase?.close();
  await database?.query('ROLLBACK').catch(() => undefined);
  await database?.end();
  if (created) { await admin.query('DROP DATABASE ' + dbName); dropped = true; }
  for (const role of createdRoles.reverse()) await admin.query('DROP ROLE ' + role);
  await admin.end();
  const resolved = fs.realpathSync(taskRoot);
  assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('aipdm-dev121-precision-'));
  fs.rmSync(resolved,{ recursive: true,force: false });
  tempRemoved = !fs.existsSync(resolved);
  assert.equal(dropped,created);
  assert.ok(tempRemoved);
}
console.log(JSON.stringify({ status: 'PASS',checks,sourceProof,
  boundary: 'actual AI-PDM consumer/service/native command and request guard; synthetic OrgMaster typed/grant and Platform epoch producers and signed session',
  settingsProviderMocked: true,shareManagementRoutesActual: true,shareResourceFixtureSynthetic: true,
  providerConformance: false,productionL4: false,productionWrites: false,
  cleanup: { generatedDatabaseDropped: dropped,newRolesDropped: true,ownTempRemoved: tempRemoved } }));
