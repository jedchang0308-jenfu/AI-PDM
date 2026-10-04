// CI-only consumer regression. Typed/grant/epoch producers and signed sessions below
// are synthetic; this does not attest OrgMaster/provider/Production conformance.
// The candidate/parser/service and unchanged 071 lifecycle / 074 provision / 076 manager guard
// execute against a fresh database in the existing required CI PostgreSQL job.
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
let database, appDatabase, created = false, dropped = false, tempRemoved = false;
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
} finally {
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
  providerConformance: false,productionL4: false,productionWrites: false,
  cleanup: { generatedDatabaseDropped: dropped,newRolesDropped: true,ownTempRemoved: tempRemoved } }));
