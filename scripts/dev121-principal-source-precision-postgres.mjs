// CI-only consumer regression. The typed producer and verified session below
// are synthetic; this does not attest OrgMaster/provider/Production conformance.
// The candidate/parser/service and unchanged 074 provision + 076 manager guard
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
    purpose: 'DEV121 source timestamp precision consumer regression; synthetic producer/session',
    port: Number(baseUrl.port || '5432'), owningProcessTree: 'required CI PostgreSQL service / this test client',
    mutationScope: dbName, PDM_DATA_DIR: process.env.PDM_DATA_DIR,
    PDM_REPOSITORY_DIR: process.env.PDM_REPOSITORY_DIR,
    cleanupCondition: 'Close this client, drop only this generated database and newly created roles, remove own temp root',
    productionWrites: false } }));
  await database.query(`
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_contract;
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
      minimum_assurance text,session_invalid_before timestamptz);
    CREATE TABLE ai_pdm_core.principal_session_records (
      principal_id text,session_id_hash text,issued_at timestamptz,expires_at timestamptz,
      revoked_at timestamptz,lifecycle_version bigint,profile_version bigint);
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
  boundary: 'actual AI-PDM consumer/service/native command; synthetic OrgMaster typed/grant producer and verified session',
  providerConformance: false,productionL4: false,productionWrites: false,
  cleanup: { generatedDatabaseDropped: dropped,newRolesDropped: true,ownTempRemoved: tempRemoved } }));
