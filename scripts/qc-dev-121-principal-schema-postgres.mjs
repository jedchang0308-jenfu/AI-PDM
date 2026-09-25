#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-principal-pg-'))
assert.ok(taskRoot.startsWith(`${tempRoot}${path.sep}`), 'task-owned PostgreSQL path must remain under TEMP')
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
let port
let client
let started = false
let stopped = false
let released = false
let tempRemoved = false

process.env.PDM_DATA_DIR = path.join(taskRoot, 'pdm-data')
process.env.PDM_REPOSITORY_DIR = path.join(taskRoot, 'pdm-repository')

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const selectedPort = typeof address === 'object' && address ? address.port : undefined
      server.close((error) => error ? reject(error) : resolve(selectedPort))
    })
  })
}
async function portReleased(value) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: value })
    socket.setTimeout(750)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}
async function asRole(role, sql, params = []) {
  await client.query('BEGIN')
  try {
    await client.query(`SET LOCAL ROLE ${role}`)
    const result = await client.query(sql, params)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
async function denied(action, pattern) {
  await assert.rejects(action, (error) => pattern.test(`${error.code || ''} ${error.message || ''}`))
}
async function check(name, action) {
  await action()
  checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 isolated PostgreSQL migration 065 schema and ACL QC', port,
    owningProcessTree: 'qc-dev-121-principal-schema-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'client closed, cluster stopped, port released, temporary root removed',
    mutationScope: taskRoot, PDM_DATA_DIR: process.env.PDM_DATA_DIR,
    PDM_REPOSITORY_DIR: process.env.PDM_REPOSITORY_DIR, productionWrites: false,
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust', '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' })
  started = true
  client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await client.connect()
  await client.query(`
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_contract;
    CREATE SCHEMA platform_contract;
    CREATE TABLE platform_contract.principal_state_fixture (
      principal_id text PRIMARY KEY,auth_epoch bigint NOT NULL,
      revoked_before timestamptz NULL,version bigint NOT NULL
    );
    CREATE FUNCTION platform_contract.read_principal_auth_state_v3(p_principal_id text)
    RETURNS TABLE(principal_id text,auth_epoch bigint,revoked_before timestamptz,version bigint)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
    AS 'SELECT state.principal_id,state.auth_epoch,state.revoked_before,state.version
        FROM platform_contract.principal_state_fixture state
        WHERE state.principal_id=p_principal_id';
    GRANT USAGE ON SCHEMA platform_contract TO jenfu_ai_pdm_migrator;
    GRANT EXECUTE ON FUNCTION platform_contract.read_principal_auth_state_v3(text)
      TO jenfu_ai_pdm_migrator;
    GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
    GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
    CREATE TABLE orgmaster_contract.v_active_principal_accounts_v1 (
      principal_issuer text, principal_subject text, principal_id text,
      employee_id text, account_type text, contract_version text, employee_status text,
      mapping_version bigint, published_at timestamptz
    );
    CREATE TABLE orgmaster_contract.v_active_principal_mappings_v1 (
      principal_issuer text, principal_subject text, principal_id text,
      employee_id text, contract_version text, employee_status text,
      mapping_version bigint, published_at timestamptz
    );
    CREATE TABLE orgmaster_contract.v_ai_pdm_entitlement_authority_v1 (
      employee_id text, authority_version bigint, contract_version text,
      application_id text, authority_source text
    );
    CREATE TABLE orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 (
      authority_version bigint, contract_version text, application_id text,
      principal_id text, employee_id text,
      identity_issuer text, identity_subject text,
      stable_role_id text, role_code text, valid_from timestamptz,
      valid_until timestamptz, scope_kind text, scope_key text,
      subject_kind text, target_principal_id text, grant_kind text, delegation_id text
    );
    CREATE TABLE orgmaster_contract.v_ai_pdm_principal_effective_grants_v2 (
      authority_version bigint, contract_version text, application_id text,
      principal_id text, employee_id text, stable_role_id text, role_code text,
      valid_from timestamptz, valid_until timestamptz, scope_kind text,
      scope_key text, subject_kind text, target_principal_id text,
      grant_kind text, delegation_id text, assignment_version_id text,
      assignment_version bigint, assignment_id text, catalog_version text,
      published_at timestamptz
    );
    GRANT SELECT ON ALL TABLES IN SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_contract.v_application_role_catalog_v1 (
      stable_role_id text, role_code text, contract_version text, application_id text,
      assignable boolean, subject_kind text, allowed_scope_kinds jsonb, permissions jsonb,
      catalog_version text NOT NULL DEFAULT 'ai-pdm.role-catalog.fixture.v3',
      catalog_sha256 text NOT NULL DEFAULT repeat('a',64),
      role_definition_hash text NOT NULL DEFAULT repeat('b',64)
    );
    GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1 TO jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.companies (
      id text PRIMARY KEY, company_code text NOT NULL,
      company_kind text NOT NULL, display_name text NOT NULL
    );
    CREATE TABLE ai_pdm_core.users (
      id text PRIMARY KEY, company_id text NOT NULL, display_name text NOT NULL DEFAULT '',
      email text UNIQUE, password_hash text,
      role text NOT NULL DEFAULT 'Engineer', account_status text NOT NULL DEFAULT 'active',
      account_lifecycle_version bigint NOT NULL DEFAULT 1, system_role_enabled integer NOT NULL DEFAULT 1,
      session_invalid_before timestamptz NULL,
      account_status_changed_at timestamptz, account_status_reason text
    );
    CREATE TABLE ai_pdm_core.roles (
      id text PRIMARY KEY, role_code text NOT NULL UNIQUE, enabled integer NOT NULL DEFAULT 1
    );
    CREATE TABLE ai_pdm_core.role_permissions (
      id text PRIMARY KEY, role_id text NOT NULL REFERENCES ai_pdm_core.roles(id),
      permission_kind text NOT NULL, permission_code text NOT NULL, allowed integer NOT NULL
    );
    CREATE TABLE ai_pdm_core.role_scope_rules (
      id text PRIMARY KEY, role_id text NOT NULL REFERENCES ai_pdm_core.roles(id),
      scope_kind text NOT NULL, scope_code text NOT NULL, allowed integer NOT NULL
    );
    CREATE TABLE ai_pdm_core.user_role_assignments (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES ai_pdm_core.users(id),
      sponsor_user_id text NULL REFERENCES ai_pdm_core.users(id), role_id text NOT NULL,
      reason text NOT NULL DEFAULT '',scope_template text NOT NULL DEFAULT 'workspace_all',
      named_scope text NOT NULL DEFAULT '',starts_at timestamptz NULL,
      review_due_at timestamptz NULL,hard_ends_at timestamptz NULL,
      assigned_by text NOT NULL DEFAULT 'pdm-user-one',
      assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      revoked_at timestamptz NULL,revoked_by text NULL
    );
    CREATE TABLE ai_pdm_core.approval_delegations (
      id text PRIMARY KEY, delegated_from text NOT NULL REFERENCES ai_pdm_core.users(id),
      delegated_to text NOT NULL REFERENCES ai_pdm_core.users(id),
      project_code text NULL,action_code text NULL,starts_at timestamptz NULL,
      ends_at timestamptz NULL,reason text NOT NULL DEFAULT '',
      created_by text NOT NULL DEFAULT 'pdm-user-one',
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      revoked_at timestamptz NULL,revoked_by text NULL
    );
    CREATE TABLE ai_pdm_core.role_priority_versions (
      id text PRIMARY KEY,version_code text NOT NULL,
      priority_json text NOT NULL,status text NOT NULL
    );
    CREATE TABLE ai_pdm_core.active_role_catalog (
      application_id text PRIMARY KEY,catalog_version text NOT NULL
    );
    CREATE TABLE ai_pdm_core.role_catalog_publications (
      catalog_version text PRIMARY KEY,application_id text NOT NULL,status text NOT NULL
    );
    CREATE TABLE ai_pdm_core.role_catalog_entries (
      catalog_version text NOT NULL,stable_role_id text NOT NULL,
      role_code text NOT NULL,PRIMARY KEY(catalog_version,stable_role_id)
    );
    CREATE TABLE ai_pdm_core.auth_identities (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES ai_pdm_core.users(id),
      provider text NOT NULL DEFAULT 'local_password', provider_subject text,
      status text NOT NULL DEFAULT 'active', verified_at timestamptz
    );
    CREATE TABLE ai_pdm_core.account_session_records (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES ai_pdm_core.users(id),
      company_id text NOT NULL DEFAULT 'company-jenfu',
      session_id_hash text NOT NULL DEFAULT '',
      auth_provider text NOT NULL DEFAULT 'firebase_bff',
      assurance_level text NOT NULL DEFAULT 'aal1',
      issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '1 hour'),
      revoked_at timestamptz NULL
    );
    CREATE TABLE ai_pdm_core.user_company_memberships (
      user_id text NOT NULL REFERENCES ai_pdm_core.users(id), company_id text NOT NULL,
      is_default integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY (user_id, company_id)
    );
    CREATE TABLE ai_pdm_core.platform_principal_mappings (
      platform_principal_id text PRIMARY KEY,
      pdm_user_id text NOT NULL REFERENCES ai_pdm_core.users(id),
      mapping_source text NOT NULL DEFAULT 'current_pdm',
      mapping_status text NOT NULL DEFAULT 'active', external_subject text
    );
    CREATE TABLE ai_pdm_core.platform_command_receipts (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      actor_id text NULL REFERENCES ai_pdm_core.users(id),
      platform_principal_id text NULL REFERENCES ai_pdm_core.platform_principal_mappings(platform_principal_id),
      platform_organization_id text NOT NULL
    );
    CREATE TABLE ai_pdm_core.platform_outbox_events (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      actor_id text NULL REFERENCES ai_pdm_core.users(id),
      platform_principal_id text NULL REFERENCES ai_pdm_core.platform_principal_mappings(platform_principal_id),
      platform_organization_id text NOT NULL
    );
    CREATE TABLE ai_pdm_core.employee_login_aliases (
      id text PRIMARY KEY, pdm_user_id text NOT NULL REFERENCES ai_pdm_core.users(id)
    );
    ALTER TABLE ai_pdm_core.users OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.companies OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.roles OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.role_permissions OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.role_scope_rules OWNER TO jenfu_ai_pdm_migrator;
    GRANT SELECT ON ai_pdm_core.roles,ai_pdm_core.role_permissions,
      ai_pdm_core.role_scope_rules TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.companies,ai_pdm_core.users TO jenfu_ai_pdm_runtime;
    ALTER TABLE ai_pdm_core.user_role_assignments OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.approval_delegations OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.role_priority_versions OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.active_role_catalog OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.role_catalog_publications OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.role_catalog_entries OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.auth_identities OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.account_session_records OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.user_company_memberships OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.platform_principal_mappings OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.platform_command_receipts OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.platform_outbox_events OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.employee_login_aliases OWNER TO jenfu_ai_pdm_migrator;
    INSERT INTO ai_pdm_core.companies VALUES
      ('company-one','OTHER','business','Other'),
      ('company-jenfu','JENFU','business','Jenfu');
    INSERT INTO ai_pdm_core.users (id,company_id)
      VALUES ('pdm-user-one','company-one'),('pdm-user-two','company-one');
    INSERT INTO ai_pdm_core.roles VALUES ('role-one','qa',1),('role-rd','rd',1);
    INSERT INTO ai_pdm_core.role_priority_versions VALUES
      ('priority-one','priority.v1','["qa","rd"]','active');
    INSERT INTO ai_pdm_core.active_role_catalog VALUES
      ('ai-pdm','ai-pdm.role-catalog.fixture.v3');
    INSERT INTO ai_pdm_core.role_catalog_publications VALUES
      ('ai-pdm.role-catalog.fixture.v3','ai-pdm','active');
    INSERT INTO ai_pdm_core.role_catalog_entries VALUES
      ('ai-pdm.role-catalog.fixture.v3','role-rd','rd');
    INSERT INTO ai_pdm_contract.v_application_role_catalog_v1
      (stable_role_id,role_code,contract_version,application_id,assignable,
       subject_kind,allowed_scope_kinds,permissions)
      VALUES ('role-rd','rd','jenfu.platform-entitlement.v1','ai-pdm',true,
              'employee','["workspace"]'::jsonb,'[]'::jsonb);
  `)
  const migration = fs.readFileSync(path.join(root, 'db/postgres/065_dev121_principal_security_subject.sql'), 'utf8')
  await client.query(migration)
  const principalGrantsMigration = fs.readFileSync(path.join(root,
    'db/postgres/067_dev121_principal_account_manager_grants_v2.sql'), 'utf8')
  await client.query(principalGrantsMigration)
  await client.query('DROP TABLE orgmaster_contract.v_ai_pdm_effective_role_assignments_v1')

  await check('one canonical principal owns one historical PDM profile', async () => {
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-one','pdm-user-one','company-one','employee-one','human_personal','active',3,2,true,'aal1')`)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-two','pdm-user-one','company-one','employee-one','human_personal','active',1,1,true,'aal1')`), /23505/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('wrong-company','pdm-user-two','company-jenfu','employee-two',
              'human_personal','active',1,1,true,'aal1')`), /23503/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('privileged','pdm-user-two','company-one','employee-two','human_privileged','active',1,1,true,'aal1')`), /23514/)
  })

  await check('canonical command provenance does not require an old principal mapping', async () => {
    for (const table of ['platform_command_receipts', 'platform_outbox_events']) {
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id)
        VALUES ($1,'company-one','pdm-user-one','principal-one')`, [`canonical-${table}`])
      const row = await client.query(`SELECT actor_id,principal_id,platform_principal_id,platform_organization_id
        FROM ai_pdm_core.${table} WHERE id=$1`, [`canonical-${table}`])
      assert.deepEqual(row.rows[0], { actor_id: 'pdm-user-one', principal_id: 'principal-one',
        platform_principal_id: null, platform_organization_id: null })
      await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id)
        VALUES ($1,'company-one','pdm-user-two','principal-one')`,
        [`wrong-profile-${table}`]), /23503/)
      await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id)
        VALUES ($1,'company-one','pdm-user-one','missing-principal')`,
        [`missing-principal-${table}`]), /23503/)
      await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id)
        VALUES ($1,'company-jenfu','pdm-user-one','principal-one')`,
        [`wrong-workspace-${table}`]), /23503/)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id) VALUES ($1,'pdm-user-two')`, [`legacy-${table}`])
      await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id,platform_principal_id)
        VALUES ($1,'company-one','pdm-user-one','principal-one',$2)`,
        [`mixed-${table}`,`legacy-${table}`]), /23514/)
      await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.${table}
        (id,company_id,actor_id,principal_id,platform_organization_id)
        VALUES ($1,'company-one','pdm-user-one','principal-one','old-organization')`,
        [`old-organization-${table}`]), /23514/)
    }
  })

  await check('verified inventory precedes account materialization but activation requires the exact pair', async () => {
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
      (id,company_id) VALUES ('pdm-user-four','company-one')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,principal_id,status,source_hash) VALUES
      ('pdm-user-four','principal-four','legacy_compatible',$1)`, ['4'.repeat(64)])
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json)
      VALUES ('operation-four','cutover',$1,$2,'{}'::jsonb)`, ['4'.repeat(64), '5'.repeat(64)])
    await denied(() => asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_identity_cutovers
      SET status='principal_active',operation_id='operation-four',activated_at=clock_timestamp(),
          row_version=2 WHERE pdm_user_id='pdm-user-four'`), /23503/)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-four','pdm-user-four','company-one','employee-four','human_personal','active',1,1,true,'aal1')`)
    await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_identity_cutovers
      SET status='principal_active',operation_id='operation-four',activated_at=clock_timestamp(),
          row_version=2 WHERE pdm_user_id='pdm-user-four'`)
    const result = await asRole('jenfu_ai_pdm_runtime', `SELECT status,principal_id
      FROM ai_pdm_core.read_principal_cutover_for_command_v1('pdm-user-four')`)
    assert.deepEqual(result.rows[0], { status: 'principal_active', principal_id: 'principal-four' })
  })

  if (process.argv.includes('--AclReadback')) {
    await check('exact provider subject inventory matches published principal and local profile in one snapshot', async () => {
      const { JenfuPrincipalInventoryRepository } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-inventory-repository.ts')).href)
      const publishedAt = '2026-09-25T02:00:00.000Z'
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users (id,company_id)
        VALUES ('pdm-user-inventory','company-jenfu'),('pdm-user-google','company-jenfu')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject)
        VALUES ('legacy-principal-inventory','pdm-user-inventory','shared_iam','active','firebase-subject')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.auth_identities
        (id,user_id,provider,provider_subject,status,verified_at)
        VALUES ('google-inventory','pdm-user-google','google_oauth','google-subject','active',clock_timestamp())`)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-subject',
                'principal-inventory','employee-inventory',
                'human_personal','organization.active-principal.v1','active',2,$1),
               ('https://accounts.google.com','google-subject','principal-google','employee-google',
                'human_personal','organization.active-principal.v1','active',3,$1)`, [publishedAt])
      const read = async (candidate, isolation = 'REPEATABLE READ') => {
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolation} READ ONLY`)
        try {
          await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
          const adapter = { kind: 'postgres', query: async (sql, params = {}) => {
            const names = []
            const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
              let index = names.indexOf(name)
              if (index < 0) { names.push(name); index = names.length - 1 }
              return `$${index + 1}`
            })
            return (await client.query(bound, names.map((name) => params[name]))).rows
          } }
          const repository = new JenfuPrincipalInventoryRepository(adapter, 'test-project')
          const result = Array.isArray(candidate)
            ? await repository.requireExactCandidateSet(candidate)
            : await repository.requireExactCandidate(candidate)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      }
      const firebase = { pdmUserId: 'pdm-user-inventory', companyId: 'company-jenfu',
        principalId: 'principal-inventory', employeeId: 'employee-inventory',
        identityIssuer: 'https://securetoken.google.com/test-project',
        identitySubject: 'firebase-subject',
        sourceKind: 'firebase_mapping', mappingVersion: 2, publishedAt }
      const google = { ...firebase, pdmUserId: 'pdm-user-google', principalId: 'principal-google',
        employeeId: 'employee-google', identityIssuer: 'https://accounts.google.com',
        identitySubject: 'google-subject', sourceKind: 'google_oauth', mappingVersion: 3 }
      assert.equal((await read(firebase)).principalId, 'principal-inventory')
      assert.equal((await read(google)).principalId, 'principal-google')
      const { lockPrincipalCutoverOwnerSources } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-cutover-locks.ts')).href)
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        const namedQuery = async (sql, params = {}) => {
          const names = []
          const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
            let index = names.indexOf(name)
            if (index < 0) { names.push(name); index = names.length - 1 }
            return `$${index + 1}`
          })
          return (await client.query(bound, names.map((name) => params[name]))).rows
        }
        const adapter = { kind:'postgres', query:namedQuery,
          queryOne:async (sql, params) => (await namedQuery(sql, params))[0] ?? null,
          execute:async (sql, params) => { await namedQuery(sql, params) } }
        const lockedRepository = new JenfuPrincipalInventoryRepository(
          adapter, 'test-project', 'locked_owner_apply')
        await assert.rejects(lockedRepository.requireExactCandidate(firebase),
          /PRINCIPAL_CUTOVER_LOCKS_MISSING/)
        assert.deepEqual(await lockPrincipalCutoverOwnerSources(
          adapter, 'operation-inventory-lock-test', ['pdm-user-inventory'],
          'a'.repeat(64), 'b'.repeat(64)), { status:'locked' })
        assert.equal((await lockedRepository.requireExactCandidate(firebase)).principalId,
          'principal-inventory')
      } finally {
        await client.query('ROLLBACK')
      }
      const barrier = '2026-09-25T02:01:00.000Z'
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.users
        SET account_status='suspended',system_role_enabled=0,
            account_lifecycle_version=4,session_invalid_before=$1
        WHERE id='pdm-user-google'`, [barrier])
      const suspended = await read(google)
      assert.equal(suspended.accountStatus, 'suspended')
      assert.equal(suspended.systemRoleEnabled, false)
      assert.equal(suspended.lifecycleVersion, 4)
      assert.equal(suspended.sessionInvalidBefore, barrier)
      await assert.rejects(read({ ...firebase, companyId: 'company-one' }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, principalId: 'principal-other' }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, principalId: 'pdm:pdm-user-inventory' }),
        /principal_inventory_invalid/)
      await assert.rejects(read({ ...firebase, employeeId: 'other-employee' }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, mappingVersion: 3 }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, publishedAt: '2026-09-25T02:00:01.000Z' }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, identitySubject: 'unknown-subject' }),
        /principal_inventory_mismatch/)
      await assert.rejects(read({ ...firebase, identityIssuer: 'https://accounts.google.com' }),
        /principal_inventory_invalid/)
      await assert.rejects(read({ ...google,
        identityIssuer: 'https://securetoken.google.com/test-project' }),
      /principal_inventory_invalid/)
      await assert.rejects(read(firebase, 'READ COMMITTED'), /principal_inventory_mismatch/)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-subject',
                'principal-other','employee-other',
                'human_personal','organization.active-principal.v1','active',2,$1)`, [publishedAt])
      await assert.rejects(read(firebase), /principal_inventory_mismatch/)
      await client.query(`DELETE FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id='principal-other'`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.auth_identities
        (id,user_id,provider,provider_subject,status,verified_at)
        VALUES ('disabled-inventory','pdm-user-inventory','google_oauth',
                'old-google-subject','disabled',NULL)`)
      await assert.rejects(read(firebase), /principal_inventory_mismatch/)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject)
        VALUES ('legacy-principal-google','pdm-user-google','shared_iam','active','other-firebase-subject')`)
      await assert.rejects(read(google), /principal_inventory_mismatch/)
      const firebaseAlias = { ...google, sourceKind: 'firebase_mapping',
        identityIssuer: 'https://securetoken.google.com/test-project',
        identitySubject: 'other-firebase-subject', mappingVersion: 4 }
      await assert.rejects(read([google, firebaseAlias]), /principal_inventory_mismatch/)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','other-firebase-subject',
                'principal-google','employee-google','human_personal',
                'organization.active-principal.v1','active',4,$1)`, [publishedAt])
      const complete = await read([google, firebaseAlias])
      assert.equal(complete.length, 2)
      assert.ok(complete.every((entry) => entry.principalId === 'principal-google' &&
        entry.accountStatus === 'suspended'))
      await assert.rejects(read([google, { ...firebaseAlias, principalId: 'principal-other' }]),
        /principal_inventory_invalid/)
      await assert.rejects(read([google, google]), /principal_inventory_invalid/)
      await client.query(`UPDATE orgmaster_contract.v_active_principal_accounts_v1
        SET account_type='human_privileged'
        WHERE principal_subject='other-firebase-subject'`)
      await assert.rejects(read([google, firebaseAlias]), /principal_inventory_mismatch/)
    })
    await check('owner inventory and cutover source gate commit, rollback and replay', async () => {
      const { previewPrincipalInventory, registerPrincipalInventory } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-inventory-registration.ts')).href)
      const namedQuery = async (sql, params = {}) => {
        const names = []
        const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
          let index = names.indexOf(name)
          if (index < 0) { names.push(name); index = names.length - 1 }
          return `$${index + 1}`
        })
        return (await client.query(bound, names.map((name) => params[name]))).rows
      }
      const adapter = { kind: 'postgres', query: namedQuery,
        queryOne: async (sql, params) => (await namedQuery(sql, params))[0] ?? null,
        execute: async (sql, params) => { await namedQuery(sql, params) } }
      const database = { kind: 'postgres', transaction: async (action, options) => {
        assert.ok(options?.isolationLevel === 'repeatable_read')
        await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ ${options.readOnly ? 'READ ONLY' : ''}`)
        try {
          const result = await action(adapter)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      } }
      const publishedAt = '2026-09-25T03:00:00.000Z'
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
        (id,company_id) VALUES ('pdm-user-register','company-jenfu')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject)
        VALUES ('legacy-principal-register','pdm-user-register','shared_iam',
                'active','firebase-register')`)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-register',
                'principal-register','employee-register','human_personal',
                'organization.active-principal.v1','active',5,$1)`, [publishedAt])
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_mappings_v1
        (principal_issuer,principal_subject,principal_id,employee_id,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-register',
                'principal-register','employee-register',
                'organization.active-principal.v1','active',5,$1)`, [publishedAt])
      const source = [{ pdmUserId: 'pdm-user-register', companyId: 'company-jenfu',
        principalId: 'principal-register', employeeId: 'employee-register',
        identityIssuer: 'https://securetoken.google.com/test-project',
        identitySubject: 'firebase-register', sourceKind: 'firebase_mapping',
        mappingVersion: 5, publishedAt }]
      const preview = await previewPrincipalInventory(database, 'test-project', source)
      assert.match(preview.sourceHash, /^[0-9a-f]{64}$/)
      assert.equal(preview.markerStatus, 'missing')
      assert.equal(preview.expectedRowVersion, 0)
      const input = { sources: source, expectedSourceHash: preview.sourceHash,
        expectedRowVersion: preview.expectedRowVersion }
      await assert.rejects(registerPrincipalInventory(database, 'test-project',
        { ...input, expectedSourceHash: '0'.repeat(64) }),
      /principal_inventory_registration_source_drift/)
      const before = await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_identity_cutovers WHERE pdm_user_id='pdm-user-register'`)
      assert.equal(before.rows[0].n, 0)
      const first = await registerPrincipalInventory(database, 'test-project', input)
      assert.deepEqual({ status: first.status, version: first.rowVersion, replayed: first.replayed },
        { status: 'legacy_compatible', version: 1, replayed: false })
      const registeredPreview = await previewPrincipalInventory(database, 'test-project', source)
      assert.equal(registeredPreview.markerStatus, 'legacy_compatible')
      assert.equal(registeredPreview.expectedRowVersion, 1)
      const again = await registerPrincipalInventory(database, 'test-project', input)
      assert.equal(again.replayed, true)
      assert.equal(again.rowVersion, 1)
      await client.query(`INSERT INTO platform_contract.principal_state_fixture
        VALUES ('principal-register',2,NULL,1)`)
      await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        VALUES ('employee-register',3,'jenfu.platform-entitlement.v1',
                'ai-pdm','legacy_authority')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
        (id,company_id) VALUES ('pdm-user-external-preview','company-jenfu')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.user_role_assignments
        (id,user_id,role_id,sponsor_user_id,assigned_by,assigned_at)
        VALUES ('assignment-preview','pdm-user-register','role-one',
                'pdm-user-external-preview','pdm-user-register','2026-09-25T03:00:00Z')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.approval_delegations
        (id,delegated_from,delegated_to,project_code,action_code,
         reason,created_by,created_at)
        VALUES ('delegation-preview','pdm-user-register','pdm-user-external-preview',
                'project-one','approve','cover','pdm-user-register',
                '2026-09-25T03:00:00Z')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
        (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
         lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
        VALUES ('principal-external-preview','pdm-user-external-preview',
                'company-jenfu','employee-external-preview',
                'human_personal','active',1,1,true,'aal1')`)
      const { previewPrincipalAclMigration, previewPrincipalCutoverSourceEnvelope,
        previewPrincipalCutoverSourceEnvelopeInSnapshot,
        readPrincipalAclMigrationSource } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-acl-migration-preview.ts')).href)
      await assert.rejects(previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      }), /principal_acl_plan_reference_unresolved/)
      // Retire the historical scoped/delegated edges before their external
      // endpoint is principal-active; the old-writer fence blocks later edits.
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.user_role_assignments
        SET revoked_at='2026-09-25T03:30:00Z'
        WHERE id='assignment-preview'`)
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.approval_delegations
        SET revoked_at='2026-09-25T03:30:00Z'
        WHERE id='delegation-preview'`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
        (operation_id,operation_kind,input_hash,cohort_hash,result_json)
        VALUES ('operation-external','cutover',$1,$2,'{}'::jsonb)`,
      ['6'.repeat(64), '7'.repeat(64)])
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
        (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
        VALUES ('pdm-user-external-preview','principal-external-preview',
                'principal_active',$1,
                'operation-external',clock_timestamp())`, ['8'.repeat(64)])
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_scope_rules
        (id,role_id,scope_kind,scope_code,allowed)
        VALUES ('rd-shadow-scope','role-rd','project','project-one',1)`)
      const blockedShadow = await previewPrincipalCutoverSourceEnvelope({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z',operationId:'operation-shadow-blocked',
        sourceRevisions:{platform:'a'.repeat(40),orgmaster:'b'.repeat(40),aiPdm:'c'.repeat(40)},
        contractManifestHashes:{platform:'d'.repeat(64),orgmaster:'e'.repeat(64),aiPdm:'f'.repeat(64)}
      })
      assert.equal(blockedShadow.workspaceShadow.status,'requires_resource_adapter')
      assert.equal(blockedShadow.workspaceShadow.gaps[0].reason,'role_scope_rule')
      const { requireCurrentPrincipalCutoverSource } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-cutover-source-gate.ts')).href)
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        await assert.rejects(requireCurrentPrincipalCutoverSource(adapter,blockedShadow),
          /PRINCIPAL_CUTOVER_WORKSPACE_SHADOW_INCOMPLETE/)
      } finally {
        await client.query('ROLLBACK')
      }
      await asRole('jenfu_ai_pdm_migrator', `DELETE FROM ai_pdm_core.role_scope_rules
        WHERE id='rd-shadow-scope'`)
      const aclPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.equal(aclPreview.cohort[0].principalId,'principal-register')
      assert.deepEqual(aclPreview.accounts.map((account) => ({
        principalId:account.principalId,pdmUserId:account.pdmUserId,
        employeeId:account.employeeId,markerRowVersion:account.markerRowVersion
      })), [{ principalId:'principal-register',pdmUserId:'pdm-user-register',
        employeeId:'employee-register',markerRowVersion:1 }])
      assert.equal(aclPreview.plan.principalAssignments.length,2)
      assert.equal(aclPreview.plan.principalDelegations.length,1)
      assert.equal(aclPreview.plan.principalAssignments[1].sponsorPrincipalId,'principal-external-preview')
      assert.equal(aclPreview.plan.principalDelegations[0].toPrincipalId,'principal-external-preview')
      assert.match(aclPreview.localSourceHash,/^[0-9a-f]{64}$/)
      assert.match(aclPreview.producerSourceHash,/^[0-9a-f]{64}$/)
      assert.match(aclPreview.graphCheck.graphHash,/^[0-9a-f]{64}$/)
      assert.equal(aclPreview.workspaceShadow.status,'pass')
      assert.match(aclPreview.workspaceShadow.shadowHash,/^[0-9a-f]{64}$/)
      const sourceEnvelope = await previewPrincipalCutoverSourceEnvelope({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z',operationId:'operation-source-envelope',
        sourceRevisions:{platform:'a'.repeat(40),orgmaster:'b'.repeat(40),aiPdm:'c'.repeat(40)},
        contractManifestHashes:{platform:'d'.repeat(64),orgmaster:'e'.repeat(64),aiPdm:'f'.repeat(64)}
      })
      assert.equal(sourceEnvelope.localSourceHash,aclPreview.localSourceHash)
      assert.equal(sourceEnvelope.producerSourceHash,aclPreview.producerSourceHash)
      assert.equal(sourceEnvelope.graphCheck.graphHash,aclPreview.graphCheck.graphHash)
      assert.equal(sourceEnvelope.workspaceShadow.shadowHash,aclPreview.workspaceShadow.shadowHash)
      assert.match(sourceEnvelope.sourceHash,/^[0-9a-f]{64}$/)
      assert.match(sourceEnvelope.inputHash,/^[0-9a-f]{64}$/)
      const runnerEnvelope = await database.transaction(async (snapshot) => {
        await snapshot.execute('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        await snapshot.execute("SET LOCAL TIME ZONE 'UTC'")
        return previewPrincipalCutoverSourceEnvelopeInSnapshot(snapshot, {
          firebaseProjectId:'test-project',sourceSets:[source],
          cutoverAt:'2026-09-25T04:00:00Z',operationId:'operation-source-envelope',
          sourceRevisions:{platform:'a'.repeat(40),orgmaster:'b'.repeat(40),aiPdm:'c'.repeat(40)},
          contractManifestHashes:{platform:'d'.repeat(64),orgmaster:'e'.repeat(64),aiPdm:'f'.repeat(64)}
        })
      }, { readOnly:true, isolationLevel:'repeatable_read' })
      assert.equal(runnerEnvelope.sourceHash,sourceEnvelope.sourceHash)
      assert.equal(runnerEnvelope.workspaceShadow.shadowHash,sourceEnvelope.workspaceShadow.shadowHash)
      const { materializePrincipalCutoverInOwnerTransaction } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-cutover-materialization.ts')).href)
      const { lockPrincipalCutoverOwnerSources } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-cutover-locks.ts')).href)
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        await client.query("SET LOCAL TIME ZONE 'UTC'")
        assert.deepEqual(await lockPrincipalCutoverOwnerSources(
          adapter, 'operation-locked-source-test', ['pdm-user-register'],
          'a'.repeat(64), 'b'.repeat(64)), { status:'locked' })
        const lockedSource = await readPrincipalAclMigrationSource(adapter, {
          firebaseProjectId:'test-project',sourceSets:[source],
          cutoverAt:'2026-09-25T04:00:00Z'
        }, 'locked_owner_apply')
        assert.equal(lockedSource.localSourceHash,aclPreview.localSourceHash)
        assert.equal(lockedSource.producerSourceHash,aclPreview.producerSourceHash)
        assert.equal(lockedSource.plan.planHash,aclPreview.plan.planHash)
        assert.deepEqual(lockedSource.accounts,aclPreview.accounts)
        const current = await requireCurrentPrincipalCutoverSource(adapter, sourceEnvelope)
        assert.equal(current.status,'current')
        assert.equal(current.seal.sourceHash,sourceEnvelope.sourceHash)
        assert.deepEqual(current.source.accounts,aclPreview.accounts)
        const materialized = await materializePrincipalCutoverInOwnerTransaction(adapter,current)
        assert.equal(materialized.accountCount,1)
        assert.equal(materialized.assignmentCount,2)
        assert.equal(materialized.delegationCount,1)
        const materializedMarker = await client.query(`SELECT status,operation_id,row_version
          FROM ai_pdm_core.principal_identity_cutovers
          WHERE pdm_user_id='pdm-user-register'`)
        assert.deepEqual(materializedMarker.rows[0], { status:'principal_active',
          operation_id:sourceEnvelope.operationId,row_version:'2' })
      } finally {
        await client.query('ROLLBACK')
      }
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_accounts WHERE principal_id='principal-register'`)).rows[0].n,0)
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_identity_operations
        WHERE operation_id='operation-source-envelope'`)).rows[0].n,0)
      assert.equal((await client.query(`SELECT row_version::text AS version,status
        FROM ai_pdm_core.principal_identity_cutovers
        WHERE pdm_user_id='pdm-user-register'`)).rows[0].version,'1')
      const afterMaterializationRollback = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.deepEqual({ local:afterMaterializationRollback.localSourceHash,
        producer:afterMaterializationRollback.producerSourceHash,
        graph:afterMaterializationRollback.graphCheck.graphHash,
        plan:afterMaterializationRollback.plan.planHash },
      { local:aclPreview.localSourceHash,producer:aclPreview.producerSourceHash,
        graph:aclPreview.graphCheck.graphHash,plan:aclPreview.plan.planHash })
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        const current = await requireCurrentPrincipalCutoverSource(adapter, sourceEnvelope)
        assert.equal(current.status,'current')
        await assert.rejects(materializePrincipalCutoverInOwnerTransaction(adapter,{
          ...current
        }), /PRINCIPAL_CUTOVER_VERIFIED_SOURCE_REQUIRED/)
        await client.query(`UPDATE ai_pdm_core.principal_identity_cutovers
          SET row_version=row_version+1 WHERE pdm_user_id='pdm-user-register'`)
        await assert.rejects(materializePrincipalCutoverInOwnerTransaction(adapter,current),
          /PRINCIPAL_CUTOVER_MATERIALIZATION_INVALID/)
      } finally {
        await client.query('ROLLBACK')
      }
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_accounts WHERE principal_id='principal-register'`)).rows[0].n,0)
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_identity_operations
        WHERE operation_id='operation-source-envelope'`)).rows[0].n,0)
      assert.equal((await client.query(`SELECT row_version::text AS version
        FROM ai_pdm_core.principal_identity_cutovers
        WHERE pdm_user_id='pdm-user-register'`)).rows[0].version,'1')
      const { capturePrincipalCutoverProducerSource } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-cutover-producer-source.ts')).href)
      const { JenfuPrincipalInventoryRepository } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-inventory-repository.ts')).href)
      await database.transaction(async (snapshot) => {
        await snapshot.execute('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        await snapshot.execute("SET LOCAL TIME ZONE 'UTC'")
        const candidates = await new JenfuPrincipalInventoryRepository(
          snapshot, 'test-project').requireExactCandidateSet(source)
        let producerQueries = 0
        const producerSnapshot = { kind:'postgres', query: async (sql, params) => {
          producerQueries += 1
          assert.match(sql, /platform_contract\.read_principal_auth_state_v3/)
          assert.match(sql, /orgmaster_contract\.v_active_principal_accounts_v1/)
          assert.match(sql, /orgmaster_contract\.v_ai_pdm_entitlement_authority_v1/)
          assert.match(sql, /orgmaster_contract\.v_ai_pdm_principal_effective_grants_v2/)
          return snapshot.query(sql, params)
        } }
        const captured = await capturePrincipalCutoverProducerSource(
          producerSnapshot, [candidates])
        assert.equal(producerQueries,1)
        assert.equal(captured,aclPreview.producerSourceHash)
      }, { readOnly:true, isolationLevel:'repeatable_read' })
      const sameAclPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.equal(sameAclPreview.localSourceHash,aclPreview.localSourceHash)
      assert.equal(sameAclPreview.producerSourceHash,aclPreview.producerSourceHash)
      await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1
        SET role_definition_hash=$1 WHERE stable_role_id='role-rd'`, ['c'.repeat(64)])
      const changedCatalogPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.notEqual(changedCatalogPreview.localSourceHash,aclPreview.localSourceHash)
      assert.equal(changedCatalogPreview.producerSourceHash,aclPreview.producerSourceHash)
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        await client.query("SET LOCAL TIME ZONE 'UTC'")
        await assert.rejects(requireCurrentPrincipalCutoverSource(adapter, sourceEnvelope),
          /PRINCIPAL_CUTOVER_SOURCE_DRIFT/)
      } finally {
        await client.query('ROLLBACK')
      }
      await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1
        SET role_definition_hash=$1 WHERE stable_role_id='role-rd'`, ['b'.repeat(64)])
      await client.query(`DELETE FROM platform_contract.principal_state_fixture
        WHERE principal_id='principal-register'`)
      await assert.rejects(previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      }), /PRINCIPAL_PRODUCER_SOURCE_INVALID/)
      await client.query(`INSERT INTO platform_contract.principal_state_fixture
        VALUES ('principal-register',2,NULL,1)`)
      await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        VALUES ('employee-register',99,'jenfu.platform-entitlement.v1',
                'ai-pdm','legacy_authority')`)
      await assert.rejects(previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      }), /PRINCIPAL_PRODUCER_SOURCE_INVALID/)
      await client.query(`DELETE FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        WHERE employee_id='employee-register' AND authority_version=99`)
      await client.query(`UPDATE platform_contract.principal_state_fixture
        SET auth_epoch=3,version=2 WHERE principal_id='principal-register'`)
      const changedProducerPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.notEqual(changedProducerPreview.producerSourceHash,aclPreview.producerSourceHash)
      assert.equal(changedProducerPreview.localSourceHash,aclPreview.localSourceHash)
      await client.query(`UPDATE platform_contract.principal_state_fixture
        SET auth_epoch=2,version=1 WHERE principal_id='principal-register'`)
      await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        SET authority_version=4 WHERE employee_id='employee-register'`)
      const changedAuthorityPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.notEqual(changedAuthorityPreview.producerSourceHash,aclPreview.producerSourceHash)
      assert.equal(changedAuthorityPreview.localSourceHash,aclPreview.localSourceHash)
      await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        SET authority_version=3 WHERE employee_id='employee-register'`)
      await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        (authority_version,contract_version,application_id,principal_id,employee_id,
         stable_role_id,role_code,valid_from,
         scope_kind,scope_key,subject_kind,grant_kind)
        VALUES (3,'jenfu.orgmaster.ai-pdm-principal-grants.v2','ai-pdm','principal-register',
                'employee-register','role-qa','qa',clock_timestamp(),
                'workspace','company-jenfu','employee','direct')`)
      await assert.rejects(previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      }), /PRINCIPAL_PRODUCER_SOURCE_INVALID/)
      await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        SET authority_source='orgmaster_authority' WHERE employee_id='employee-register'`)
      const grantPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.notEqual(grantPreview.producerSourceHash,aclPreview.producerSourceHash)
      assert.equal(grantPreview.localSourceHash,aclPreview.localSourceHash)
      await client.query(`DELETE FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        WHERE principal_id='principal-register'`)
      await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        SET authority_source='legacy_authority' WHERE employee_id='employee-register'`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_permissions
        (id,role_id,permission_kind,permission_code,allowed)
        VALUES ('policy-preview','role-rd','action','drawing.read',0)`)
      const changedAclPreview = await previewPrincipalAclMigration({
        database,firebaseProjectId:'test-project',sourceSets:[source],
        cutoverAt:'2026-09-25T04:00:00Z'
      })
      assert.notEqual(changedAclPreview.localSourceHash,aclPreview.localSourceHash)
      await asRole('jenfu_ai_pdm_migrator', `DELETE FROM ai_pdm_core.role_permissions
        WHERE id='policy-preview'`)
      await assert.rejects(registerPrincipalInventory(database, 'test-project',
        { ...input, expectedSourceHash: '0'.repeat(64) }),
      /principal_inventory_registration_source_drift/)
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.users
        SET account_status='suspended',system_role_enabled=0,account_lifecycle_version=2
        WHERE id='pdm-user-register'`)
      await assert.rejects(registerPrincipalInventory(database, 'test-project', input),
        /principal_inventory_registration_source_drift/)
      const changed = await previewPrincipalInventory(database, 'test-project', source)
      assert.equal(changed.expectedRowVersion, 1)
      await assert.rejects(registerPrincipalInventory(database, 'test-project',
        { ...input, expectedSourceHash: changed.sourceHash }),
      /principal_inventory_registration_conflict/)
      const updated = await registerPrincipalInventory(database, 'test-project',
        { ...input, expectedSourceHash: changed.sourceHash, expectedRowVersion: 1 })
      assert.equal(updated.rowVersion, 2)
      assert.equal(updated.replayed, false)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
        (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
         lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
        VALUES ('principal-register','pdm-user-register','company-jenfu','employee-register',
                'human_personal','suspended',2,1,false,'aal1')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
        (operation_id,operation_kind,input_hash,cohort_hash,result_json)
        VALUES ('operation-register','cutover',$1,$2,'{}'::jsonb)`,
      ['a'.repeat(64), 'b'.repeat(64)])
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_identity_cutovers
        SET status='principal_active',operation_id='operation-register',
            activated_at=clock_timestamp(),row_version=3
        WHERE pdm_user_id='pdm-user-register'`)
      await assert.rejects(registerPrincipalInventory(database, 'test-project',
        { ...input, expectedSourceHash: changed.sourceHash, expectedRowVersion: 2 }),
      /principal_inventory_already_active/)
      await assert.rejects(previewPrincipalInventory(database, 'test-project', source),
        /principal_inventory_already_active/)
      const marker = await client.query(`SELECT status,row_version,source_hash
        FROM ai_pdm_core.principal_identity_cutovers WHERE pdm_user_id='pdm-user-register'`)
      assert.equal(marker.rows[0].status, 'principal_active')
      assert.equal(Number(marker.rows[0].row_version), 3)
      assert.equal(marker.rows[0].source_hash, changed.sourceHash)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
        (id,company_id) VALUES ('pdm-user-untyped','company-jenfu')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject)
        VALUES ('legacy-principal-untyped','pdm-user-untyped','shared_iam',
                'active','firebase-untyped')`)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_mappings_v1
        (principal_issuer,principal_subject,principal_id,employee_id,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-untyped',
                'principal-untyped','employee-untyped',
                'organization.active-principal.v1','active',7,$1)`, [publishedAt])
      const { previewPrincipalInventoryCoverage } = await import(pathToFileURL(
        path.join(root, 'src/lib/jenfu-principal-inventory-coverage.ts')).href)
      const coverage = await previewPrincipalInventoryCoverage(database, 'test-project')
      assert.equal(coverage.totalProfiles, coverage.profiles.length)
      assert.ok(coverage.activeUnresolvedProfiles > 0)
      const discovered = coverage.sources.find((candidate) =>
        candidate.pdmUserId === 'pdm-user-register' &&
        candidate.sourceKind === 'firebase_mapping')
      assert.equal(discovered?.identityIssuer,
        'https://securetoken.google.com/test-project')
      assert.equal(discovered?.principalId, 'principal-register')
      assert.equal(discovered?.employeeId, 'employee-register')
      assert.equal(discovered?.publishedMapping.principalId, 'principal-register')
      assert.equal(discovered?.publishedMapping.employeeId, 'employee-register')
      assert.equal(discovered?.localEligible, true)
      assert.ok(!Object.hasOwn(discovered, 'email'))
      const missingTyped = coverage.sources.find((candidate) =>
        candidate.pdmUserId === 'pdm-user-untyped')
      assert.equal(missingTyped?.publishedMapping.principalId, 'principal-untyped')
      assert.equal(missingTyped?.principalId, null)
      const activeWithoutLegacyProvider = coverage.profiles.find(
        (profile) => profile.pdmUserId === 'pdm-user-four')
      assert.equal(activeWithoutLegacyProvider?.markerStatus, 'principal_active')
      assert.deepEqual(activeWithoutLegacyProvider?.issues, [])
      const missing = coverage.profiles.find((profile) => profile.pdmUserId === 'pdm-user-one')
      assert.equal(missing?.markerStatus, 'missing')
      assert.ok(missing?.issues.includes('inventory_missing'))
      assert.equal(typeof missing?.displayName, 'string')
      assert.equal(missing?.contactEmail, null)
      // Commit, deferred-FK readback and unknown-outcome replay use a separate
      // synthetic subject so the earlier registration drift vectors remain intact.
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
        (id,company_id) VALUES ('pdm-user-materialize','company-jenfu')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.platform_principal_mappings
        (platform_principal_id,pdm_user_id,mapping_source,mapping_status,external_subject)
        VALUES ('legacy-principal-materialize','pdm-user-materialize','shared_iam',
                'active','firebase-materialize')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.account_session_records
        (id,user_id) VALUES ('old-session-materialize','pdm-user-materialize')`)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('https://securetoken.google.com/test-project','firebase-materialize',
                'principal-materialize','employee-materialize','human_personal',
                'organization.active-principal.v1','active',1,$1)`, [publishedAt])
      await client.query(`INSERT INTO platform_contract.principal_state_fixture
        VALUES ('principal-materialize',1,NULL,1)`)
      await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        VALUES ('employee-materialize',1,'jenfu.platform-entitlement.v1',
                'ai-pdm','legacy_authority')`)
      const commitSource = [{ pdmUserId:'pdm-user-materialize',companyId:'company-jenfu',
        principalId:'principal-materialize',employeeId:'employee-materialize',
        identityIssuer:'https://securetoken.google.com/test-project',
        identitySubject:'firebase-materialize',sourceKind:'firebase_mapping',
        mappingVersion:1,publishedAt }]
      const inventoryPreview = await previewPrincipalInventory(database,'test-project',commitSource)
      await registerPrincipalInventory(database,'test-project',{
        sources:commitSource,expectedSourceHash:inventoryPreview.sourceHash,
        expectedRowVersion:0
      })
      const preparedCommit = await previewPrincipalCutoverSourceEnvelope({
        database,firebaseProjectId:'test-project',sourceSets:[commitSource],
        cutoverAt:'2026-09-25T04:00:00Z',operationId:'operation-materialize-commit',
        sourceRevisions:{platform:'a'.repeat(40),orgmaster:'b'.repeat(40),aiPdm:'c'.repeat(40)},
        contractManifestHashes:{platform:'d'.repeat(64),orgmaster:'e'.repeat(64),aiPdm:'f'.repeat(64)}
      })
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        const current = await requireCurrentPrincipalCutoverSource(adapter,preparedCommit)
        assert.equal(current.status,'current')
        await materializePrincipalCutoverInOwnerTransaction(adapter,current)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
      const committed = await client.query(`SELECT account.principal_id,marker.status,
        marker.operation_id,old_session.revoked_at
        FROM ai_pdm_core.principal_accounts account
        JOIN ai_pdm_core.principal_identity_cutovers marker
          ON marker.pdm_user_id=account.pdm_user_id
        JOIN ai_pdm_core.account_session_records old_session
          ON old_session.user_id=account.pdm_user_id
        WHERE account.pdm_user_id='pdm-user-materialize'`)
      assert.equal(committed.rows.length,1)
      assert.deepEqual([committed.rows[0].principal_id,committed.rows[0].status,
        committed.rows[0].operation_id],
      ['principal-materialize','principal_active','operation-materialize-commit'])
      assert.ok(committed.rows[0].revoked_at)
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_role_assignments
        WHERE principal_id='principal-materialize'`)).rows[0].n,1)
      const committedReceipt = await client.query(`SELECT operation_kind,input_hash,
        cohort_hash,result_json FROM ai_pdm_core.principal_identity_operations
        WHERE operation_id='operation-materialize-commit'`)
      assert.equal(committedReceipt.rows.length,1)
      assert.equal(committedReceipt.rows[0].operation_kind,'cutover')
      assert.equal(committedReceipt.rows[0].input_hash,preparedCommit.inputHash)
      assert.equal(committedReceipt.rows[0].cohort_hash,preparedCommit.cohortHash)
      assert.equal(committedReceipt.rows[0].result_json.accountCount,1)
      await assert.rejects(asRole('jenfu_ai_pdm_migrator',
        `INSERT INTO ai_pdm_core.account_session_records (id,user_id)
         VALUES ('uid-after-materialize','pdm-user-materialize')`),
      /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
        const replay = await requireCurrentPrincipalCutoverSource(adapter,preparedCommit)
        assert.equal(replay.status,'replayed')
        assert.equal(replay.result.sourceHash,preparedCommit.sourceHash)
      } finally {
        await client.query('ROLLBACK')
      }
    })
    await check('runtime principal ACL uses the installed 065 schema and exact principal', async () => {
      const { PrincipalLocalAclRepository } = await import(pathToFileURL(
        path.join(root, 'src/lib/repositories/principal-local-acl-repository.ts')).href)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_role_assignments
        (id,principal_id,role_id,origin,scope_template,assigned_at)
        VALUES ('grant-qa','principal-one','role-one','principal_assignment',
                'workspace_all','2026-09-24T12:00:00Z')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_permissions
        (id,role_id,permission_kind,permission_code,allowed)
        VALUES ('permission-create','role-one','action','numbering.create',1)`)
      const read = async () => {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        try {
          await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
          const adapter = { kind: 'postgres', query: async (sql, params = {}) => {
            const names = []
            const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
              let index = names.indexOf(name)
              if (index < 0) { names.push(name); index = names.length - 1 }
              return `$${index + 1}`
            })
            return (await client.query(bound, names.map((name) => params[name]))).rows
          } }
          const result = await new PrincipalLocalAclRepository(adapter).evaluateWorkspace({
            principalId: 'principal-one',
            permissions: [{ permissionKind: 'action', permissionCode: 'numbering.create' }],
            rolePriority: ['qa', 'rd'], decisionAt: new Date(), assuranceLevel: 'aal1'
          })
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      }
      assert.equal((await read())[0].allowed, true)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_scope_rules
        (id,role_id,scope_kind,scope_code,allowed)
        VALUES ('qa-project-scope','role-one','project','project-one',1)`)
      assert.equal((await read())[0].allowed, false)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_role_assignments
        (id,principal_id,role_id,origin,scope_template,assigned_at)
        VALUES ('grant-rd','principal-one','role-rd','principal_assignment',
                'workspace_all','2026-09-24T12:00:00Z')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_permissions
        (id,role_id,permission_kind,permission_code,allowed)
        VALUES ('permission-rd-create','role-rd','action','numbering.create',1)`)
      assert.deepEqual((await read())[0], {
        allowed: true, decisionCode: 'allowed', roleCode: 'rd', assignmentId: 'grant-rd'
      })
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_scope_rules
        (id,role_id,scope_kind,scope_code,allowed)
        VALUES ('rd-project-scope','role-rd','project','project-one',1)`)
      assert.equal((await read())[0].allowed, false)
    })
  }

  await check('active cutover requires an account and a successful operation', async () => {
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,principal_id,status,source_hash) VALUES
      ('pdm-user-one','principal-one','principal_active',$1)`, ['a'.repeat(64)]), /23514/)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json)
      VALUES ('operation-one','cutover',$1,$2,'{}'::jsonb)`, ['a'.repeat(64), 'b'.repeat(64)])
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at) VALUES
      ('pdm-user-two','principal-one','principal_active',$1,'operation-one',clock_timestamp())`, ['a'.repeat(64)]), /23503/)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at) VALUES
      ('pdm-user-one','principal-one','principal_active',$1,'operation-one',clock_timestamp())`, ['a'.repeat(64)])
  })

  await check('owner provision assertion requires a current AAL2 session and an effective published capability', async () => {
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
      (id,company_id) VALUES ('pdm-user-admin','company-jenfu')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-admin','pdm-user-admin','company-jenfu','employee-admin','human_personal',
              'active',1,1,true,'aal2')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json)
      VALUES ('operation-admin','cutover',$1,$2,'{}'::jsonb)`, ['1'.repeat(64), '2'.repeat(64)])
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
      VALUES ('pdm-user-admin','principal-admin','principal_active',$1,'operation-admin',clock_timestamp())`,
    ['3'.repeat(64)])
    const args = ['principal-admin', 'issuer-admin', 'subject-admin', 'a'.repeat(64),
      'company-jenfu', 'accounts.invitation.manage']
    const call = `SELECT ai_pdm_core.assert_principal_account_manager_v1($1,$2,$3,$4,$5,$6)`
    await denied(() => asRole('jenfu_ai_pdm_runtime', call, args), /42501/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call, args), /AIPDM_PROVISION_ACTOR_INVALID/)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_session_records
      (principal_id,session_id_hash,principal_auth_epoch,lifecycle_version,profile_version,
       authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
      VALUES ('principal-admin',$1,0,1,1,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour','aal2',$2)`, ['a'.repeat(64), 'b'.repeat(64)])
    await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
      (principal_issuer,principal_subject,principal_id,employee_id,account_type,
       contract_version,employee_status,mapping_version,published_at)
      VALUES ('issuer-admin','subject-admin','principal-admin','employee-admin','human_personal',
              'organization.active-principal.v1','active',1,clock_timestamp())`)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call, args), /AIPDM_PROVISION_PERMISSION_DENIED/)
    await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_entitlement_authority_v1
      VALUES ('employee-admin',7,'jenfu.platform-entitlement.v1','ai-pdm','orgmaster_authority')`)
    await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
      (authority_version,contract_version,application_id,principal_id,employee_id,
       stable_role_id,role_code,valid_from,
       valid_until,scope_kind,scope_key,subject_kind,target_principal_id,
       grant_kind,delegation_id)
      VALUES (7,'jenfu.orgmaster.ai-pdm-principal-grants.v2','ai-pdm','principal-admin',
              'employee-admin','role-pdm-admin','pdm_admin',clock_timestamp()-interval '1 minute',
              NULL,'workspace','current','employee',NULL,'direct',NULL)`)
    await client.query(`INSERT INTO ai_pdm_contract.v_application_role_catalog_v1
      (stable_role_id,role_code,contract_version,application_id,assignable,
       subject_kind,allowed_scope_kinds,permissions)
      VALUES ('role-pdm-admin','pdm_admin','jenfu.platform-entitlement.v1','ai-pdm',
              true,'employee','["workspace"]'::jsonb,
              '[{"kind":"action","code":"accounts.invitation.manage","allowed":true}]'::jsonb)`)
    await asRole('jenfu_ai_pdm_migrator', call, args)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call,
      [...args.slice(0, 5), 'settings.secret.manage']), /AIPDM_PROVISION_ACTOR_INVALID/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call,
      ['principal-admin', 'issuer-admin', 'subject-admin', 'c'.repeat(64),
        'company-jenfu', 'accounts.invitation.manage']),
    /AIPDM_PROVISION_ACTOR_INVALID/)
    await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1
      SET permissions='[{"kind":"action","code":"accounts.invitation.manage","allowed":false}]'::jsonb`)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call, args), /AIPDM_PROVISION_PERMISSION_DENIED/)
    await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
      SET authority_source='legacy_authority'`)
    await denied(() => asRole('jenfu_ai_pdm_migrator', call, args), /AIPDM_PROVISION_PERMISSION_DENIED/)
    await client.query(`UPDATE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
      SET authority_source='orgmaster_authority'`)
    await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1
      SET permissions='[{"kind":"action","code":"accounts.invitation.manage","allowed":true}]'::jsonb`)
  })

  await check('principal-only provision commits atomically, replays once and leaves old membership empty', async () => {
    const publishedAt = '2026-09-25T01:23:45.000Z'
    await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
      (principal_issuer,principal_subject,principal_id,employee_id,account_type,
       contract_version,employee_status,mapping_version,published_at)
      VALUES ('issuer-target','subject-target','principal-target','employee-target',
              'human_personal','organization.active-principal.v1','active',7,$1)`, [publishedAt])
    const request = {
      contractVersion: 'ai-pdm.principal-provision.v1', operationId: 'provision-target',
      principalRef: { principalId: 'principal-target', identityIssuer: 'issuer-target',
        identitySubject: 'subject-target', employeeId: 'employee-target',
        accountType: 'human_personal', mappingVersion: 7, publishedAt },
      displayName: 'New principal profile', contactEmail: 'new-principal@jenfu.com.tw',
      accountEnabled: false, companyId: 'company-jenfu'
    }
    const provision = async (payload) => {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
        const result = await client.query(`SELECT ai_pdm_core.provision_principal_account_v1(
          $1::jsonb,'principal-admin','issuer-admin','subject-admin',$2) AS receipt`,
        [JSON.stringify(payload), 'a'.repeat(64)])
        await client.query('COMMIT')
        return result.rows[0].receipt
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }
    const first = await provision(request)
    assert.equal(first.replayed, false)
    assert.equal(first.principalId, 'principal-target')
    assert.equal(first.current.accountStatus, 'suspended')
    const row = await client.query(`SELECT profile.company_id,profile.account_status,
      profile.system_role_enabled,profile.password_hash,account.principal_id,
      (SELECT count(*)::integer FROM ai_pdm_core.user_company_memberships membership
        WHERE membership.user_id=profile.id) AS old_memberships
      FROM ai_pdm_core.users profile
      JOIN ai_pdm_core.principal_accounts account ON account.pdm_user_id=profile.id
      WHERE profile.id=$1`, [first.pdmUserId])
    assert.deepEqual(row.rows[0], { company_id: 'company-jenfu', account_status: 'suspended',
      system_role_enabled: 0, password_hash: null, principal_id: 'principal-target', old_memberships: 0 })
    const replay = await provision(request)
    assert.equal(replay.replayed, true)
    assert.equal(replay.pdmUserId, first.pdmUserId)
    await denied(() => provision({ ...request, displayName: 'Other name' }),
      /AIPDM_PROVISION_OPERATION_CONFLICT/)
    await client.query(`UPDATE orgmaster_contract.v_active_principal_accounts_v1
      SET mapping_version=8 WHERE principal_id='principal-target'`)
    await denied(() => provision({ ...request, operationId: 'provision-target-new' }),
      /AIPDM_PROVISION_SOURCE_DRIFT/)
    const count = await client.query(`SELECT count(*)::integer AS n FROM ai_pdm_core.principal_accounts
      WHERE principal_id='principal-target'`)
    assert.equal(count.rows[0].n, 1)
  })

  await check('runtime principal account list and detail read the new account without legacy membership', async () => {
    const { JenfuPrincipalAdminAccountRepository } = await import(pathToFileURL(
      path.join(root, 'src/lib/jenfu-principal-admin-account-repository.ts')).href)
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    try {
      await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
      const query = async (sql, params = {}) => {
        const names = []
        const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
          let index = names.indexOf(name)
          if (index < 0) { names.push(name); index = names.length - 1 }
          return `$${index + 1}`
        })
        return (await client.query(bound, names.map((name) => params[name]))).rows
      }
      const repository = new JenfuPrincipalAdminAccountRepository({ kind: 'postgres', query,
        queryOne: async (sql, params) => (await query(sql, params))[0] ?? null })
      const rows = await repository.list('company-jenfu')
      const created = rows.find((row) => row.principalId === 'principal-target')
      assert.ok(created)
      assert.equal(created.accountStatus, 'suspended')
      assert.equal((await repository.getByProfile('company-jenfu', created.id)).principalId,
        'principal-target')
      assert.equal(await repository.getByProfile('company-other', created.id), null)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  })

  await check('principal lifecycle uses current management grant, revokes sessions and replays without old user writes', async () => {
    await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1 SET permissions=
      '[{"kind":"action","code":"accounts.invitation.manage","allowed":true},
        {"kind":"action","code":"accounts.lifecycle.manage","allowed":true}]'::jsonb`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_session_records
      (principal_id,session_id_hash,principal_auth_epoch,lifecycle_version,profile_version,
       authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
      VALUES ('principal-target',$1,0,1,1,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour','aal1',$2)`, ['d'.repeat(64), 'b'.repeat(64)])
    const update = async (operationId, action, reason, target = 'principal-target') => {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
        const result = await client.query(`SELECT ai_pdm_core.update_principal_account_lifecycle_v1(
          $1,$2,$3,$4,'company-jenfu','principal-admin','issuer-admin','subject-admin',$5) AS receipt`,
        [operationId,target === 'principal-admin' ? 'pdm-user-admin' :
          (await client.query(`SELECT pdm_user_id FROM ai_pdm_core.principal_accounts
            WHERE principal_id='principal-target'`)).rows[0].pdm_user_id,
        action,reason,'a'.repeat(64)])
        await client.query('COMMIT')
        return result.rows[0].receipt
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }
    const first = await update('lifecycle-target-one','reactivate','approved return')
    assert.equal(first.accountStatus, 'active')
    assert.equal(first.lifecycleVersion, 2)
    assert.equal((await update('lifecycle-target-one','reactivate','approved return')).replayed, true)
    await denied(() => update('lifecycle-target-one','reactivate','changed reason'),
      /AIPDM_LIFECYCLE_OPERATION_CONFLICT/)
    const sessions = await client.query(`SELECT count(*)::integer AS active FROM ai_pdm_core.principal_session_records
      WHERE principal_id='principal-target' AND revoked_at IS NULL`)
    assert.equal(sessions.rows[0].active, 0)
    await denied(() => update('lifecycle-self','suspend','not allowed','principal-admin'),
      /AIPDM_LIFECYCLE_SELF_CHANGE_DENIED/)
    await client.query(`UPDATE ai_pdm_contract.v_application_role_catalog_v1 SET permissions=
      '[{"kind":"action","code":"accounts.invitation.manage","allowed":true},
        {"kind":"action","code":"accounts.lifecycle.manage","allowed":false}]'::jsonb`)
    await denied(() => update('lifecycle-target-two','offboard','not allowed'),
      /AIPDM_PROVISION_PERMISSION_DENIED/)
    const row = await client.query(`SELECT account.account_status,profile.account_status AS legacy_status
      FROM ai_pdm_core.principal_accounts account
      JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id
      WHERE account.principal_id='principal-target'`)
    assert.deepEqual(row.rows[0], { account_status: 'active', legacy_status: 'suspended' })
  })

  await check('principal-active profile rejects old security writers but permits contact edits', async () => {
    await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.users
      SET display_name='changed display' WHERE id='pdm-user-one'`)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.users
      SET role='Admin' WHERE id='pdm-user-one'`), /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.user_role_assignments
      (id,user_id,role_id) VALUES ('old-grant','pdm-user-one','role-one')`),
      /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.approval_delegations
      (id,delegated_from,delegated_to) VALUES ('old-delegation','pdm-user-one','pdm-user-two')`),
      /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.user_role_assignments
      (id,user_id,role_id) VALUES ('legacy-other','pdm-user-two','role-one')`)
  })

  await check('principal-active profile also rejects identity, UID session, membership and alias writers', async () => {
    const oldWrites = [
      `INSERT INTO ai_pdm_core.auth_identities (id,user_id) VALUES ('identity-old','pdm-user-one')`,
      `INSERT INTO ai_pdm_core.account_session_records (id,user_id) VALUES ('session-old','pdm-user-one')`,
      `INSERT INTO ai_pdm_core.user_company_memberships (user_id,company_id) VALUES ('pdm-user-one','company-one')`,
      `INSERT INTO ai_pdm_core.platform_principal_mappings (platform_principal_id,pdm_user_id)
        VALUES ('mapping-old','pdm-user-one')`,
      `INSERT INTO ai_pdm_core.employee_login_aliases (id,pdm_user_id) VALUES ('alias-old','pdm-user-one')`
    ]
    for (const sql of oldWrites) {
      await denied(() => asRole('jenfu_ai_pdm_migrator', sql), /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
    }
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.auth_identities
      (id,user_id) VALUES ('identity-other','pdm-user-two')`)
  })

  await check('cutover and principal/profile identity cannot be reversed', async () => {
    await denied(() => asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_identity_cutovers
      SET status='legacy_compatible',row_version=2 WHERE pdm_user_id='pdm-user-one'`),
      /AIPDM_PRINCIPAL_CUTOVER_ONE_WAY/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `DELETE FROM ai_pdm_core.principal_identity_cutovers
      WHERE pdm_user_id='pdm-user-one'`), /AIPDM_PRINCIPAL_CUTOVER_ONE_WAY/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_accounts
      SET employee_id='employee-two' WHERE principal_id='principal-one'`),
      /AIPDM_PRINCIPAL_ACCOUNT_LINK_IMMUTABLE/)
    await denied(() => asRole('jenfu_ai_pdm_migrator', `DELETE FROM ai_pdm_core.principal_identity_operations
      WHERE operation_id='operation-one'`), /AIPDM_PRINCIPAL_OPERATION_APPEND_ONLY/)
    await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_accounts
      SET account_status='suspended', lifecycle_version=4 WHERE principal_id='principal-one'`)
    await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_accounts
      SET account_status='active', lifecycle_version=5 WHERE principal_id='principal-one'`)
  })

  await check('old writer waiting behind cutover sees the committed principal marker', async () => {
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-two','pdm-user-two','company-one','employee-two','human_personal','active',1,1,true,'aal1')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json)
      VALUES ('operation-two','cutover',$1,$2,'{}'::jsonb)`, ['e'.repeat(64), 'f'.repeat(64)])
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,status,source_hash) VALUES ('pdm-user-two','legacy_compatible',$1)`, ['e'.repeat(64)])
    const cutover = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
    const writer = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
    await cutover.connect()
    await writer.connect()
    try {
      await cutover.query('BEGIN')
      await cutover.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await cutover.query(`SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('aipdm-dev121-subject'),pg_catalog.hashtext('pdm-user-two'))`)
      await cutover.query(`UPDATE ai_pdm_core.principal_identity_cutovers
        SET principal_id='principal-two',status='principal_active',operation_id='operation-two',
            activated_at=clock_timestamp(),row_version=2 WHERE pdm_user_id='pdm-user-two'`)
      await writer.query('BEGIN')
      await writer.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await writer.query('SET LOCAL statement_timeout = 4000')
      const pendingWrite = writer.query(`UPDATE ai_pdm_core.users SET role='Admin'
        WHERE id='pdm-user-two'`)
      await new Promise((resolve) => setTimeout(resolve, 150))
      await cutover.query('COMMIT')
      await denied(() => pendingWrite, /AIPDM_LEGACY_SECURITY_WRITER_RETIRED/)
      await writer.query('ROLLBACK')
      const row = await client.query(`SELECT role FROM ai_pdm_core.users WHERE id='pdm-user-two'`)
      assert.equal(row.rows[0].role, 'Engineer')
    } finally {
      await cutover.query('ROLLBACK').catch(() => undefined)
      await writer.query('ROLLBACK').catch(() => undefined)
      await cutover.end().catch(() => undefined)
      await writer.end().catch(() => undefined)
    }
  })

  await check('old security writer cannot use a stale repeatable-read snapshot', async () => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    try {
      await client.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await denied(() => client.query(`UPDATE ai_pdm_core.users SET role='Admin'
        WHERE id='pdm-user-two'`), /AIPDM_LEGACY_SECURITY_ISOLATION_UNSUPPORTED/)
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
    }
  })

  await check('serializable command marker reader aborts after concurrent cutover', async () => {
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.users
      (id,company_id) VALUES ('pdm-user-three','company-one')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance)
      VALUES ('principal-three','pdm-user-three','company-one','employee-three','human_personal','active',1,1,true,'aal1')`)
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json)
      VALUES ('operation-three','cutover',$1,$2,'{}'::jsonb)`, ['1'.repeat(64), '2'.repeat(64)])
    await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_identity_cutovers
      (pdm_user_id,status,source_hash) VALUES ('pdm-user-three','legacy_compatible',$1)`, ['1'.repeat(64)])
    const cutover = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
    const command = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
    await cutover.connect()
    await command.connect()
    try {
      await cutover.query('BEGIN')
      await cutover.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await cutover.query(`SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('aipdm-dev121-subject'),pg_catalog.hashtext('pdm-user-three'))`)
      await cutover.query(`UPDATE ai_pdm_core.principal_identity_cutovers
        SET principal_id='principal-three',status='principal_active',operation_id='operation-three',
            activated_at=clock_timestamp(),row_version=2 WHERE pdm_user_id='pdm-user-three'`)
      await command.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      await command.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
      await command.query('SET LOCAL statement_timeout = 4000')
      const staleRead = command.query(`SELECT * FROM
        ai_pdm_core.read_principal_cutover_for_command_v1('pdm-user-three')`)
      await new Promise((resolve) => setTimeout(resolve, 150))
      await cutover.query('COMMIT')
      await denied(() => staleRead, /40001/)
    } finally {
      await cutover.query('ROLLBACK').catch(() => undefined)
      await command.query('ROLLBACK').catch(() => undefined)
      await cutover.end().catch(() => undefined)
      await command.end().catch(() => undefined)
    }
  })

  await check('runtime can read account and revoke session but cannot rewrite identity or ACL', async () => {
    const rows = await asRole('jenfu_ai_pdm_runtime', `SELECT principal_id,pdm_user_id
      FROM ai_pdm_core.principal_accounts WHERE principal_id='principal-one'`)
    assert.deepEqual(rows.rows[0], { principal_id: 'principal-one', pdm_user_id: 'pdm-user-one' })
    const cutover = await asRole('jenfu_ai_pdm_runtime', `SELECT status,principal_id
      FROM ai_pdm_core.read_principal_cutover_for_command_v1('pdm-user-one')`)
    assert.deepEqual(cutover.rows[0], { status: 'principal_active', principal_id: 'principal-one' })
    await denied(() => asRole('jenfu_ai_pdm_runtime', `SELECT status,principal_id
      FROM ai_pdm_core.principal_identity_cutovers
      WHERE pdm_user_id='pdm-user-one' FOR SHARE`), /42501/)
    await denied(() => asRole('jenfu_ai_pdm_runtime', `UPDATE ai_pdm_core.principal_accounts
      SET account_status='suspended' WHERE principal_id='principal-one'`), /42501/)
    await denied(() => asRole('jenfu_ai_pdm_runtime', `INSERT INTO ai_pdm_core.principal_role_assignments
      (id,principal_id,role_id,origin,scope_template,assigned_at)
      VALUES ('grant-one','principal-one','role-one','principal_assignment','global',clock_timestamp())`), /42501/)
    await asRole('jenfu_ai_pdm_runtime', `INSERT INTO ai_pdm_core.principal_session_records
      (principal_id,session_id_hash,principal_auth_epoch,lifecycle_version,profile_version,
       authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
      VALUES ('principal-one',$1,0,3,2,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour','aal1',$2)`, ['c'.repeat(64), 'd'.repeat(64)])
    await asRole('jenfu_ai_pdm_runtime', `UPDATE ai_pdm_core.principal_session_records
      SET revoked_at=clock_timestamp(),revoke_reason='local logout'
      WHERE session_id_hash=$1`, ['c'.repeat(64)])
    await denied(() => asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.principal_session_records
      SET principal_auth_epoch=1 WHERE session_id_hash=$1`, ['c'.repeat(64)]), /AIPDM_PRINCIPAL_SESSION_BINDING_IMMUTABLE/)
  })

  if (process.argv.includes('--AclReadback')) {
    await check('principal reviewer selector uses current PostgreSQL contracts and principal ACL', async () => {
      const { selectPrincipalReviewerInSnapshot } = await import(pathToFileURL(
        path.join(root, 'src/lib/repositories/pdm-principal-reviewer-selector.ts')).href)
      const publishedCatalog = JSON.parse(fs.readFileSync(path.join(root,
        'config/access-control/jenfu-role-catalog.v4.json'), 'utf8'))
      // Earlier SQL checks use a deliberately small legacy catalog fixture.
      // The principal consumer requires exact v4 readback from its own contract.
      await client.query(`ALTER TABLE ai_pdm_contract.v_application_role_catalog_v1
        ADD COLUMN display_order integer`)
      await client.query(`DELETE FROM ai_pdm_contract.v_application_role_catalog_v1`)
      for (const [index, role] of publishedCatalog.roles.entries()) {
        await client.query(`INSERT INTO ai_pdm_contract.v_application_role_catalog_v1
          (stable_role_id,role_code,contract_version,application_id,assignable,
           subject_kind,allowed_scope_kinds,permissions,catalog_version,catalog_sha256,
           role_definition_hash,display_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
        [role.stableRoleId, role.roleCode, publishedCatalog.contractVersion,
          publishedCatalog.applicationId, role.assignable, role.subjectKind,
          JSON.stringify(role.allowedScopeKinds), JSON.stringify(role.permissions),
          publishedCatalog.catalogVersion, publishedCatalog.catalogSha256,
          role.roleDefinitionHash, index])
      }
      await client.query(`GRANT USAGE ON SCHEMA ai_pdm_contract TO jenfu_ai_pdm_runtime`)
      await client.query(`GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1
        TO jenfu_ai_pdm_runtime`)
      // Earlier fixtures model only the columns their checks consume. Complete the
      // same contract table here, after their positional INSERTs have finished.
      await client.query(`ALTER TABLE orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        ADD COLUMN operation_id text`)
      await client.query(`GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_runtime`)
      await client.query(`GRANT SELECT ON
        orgmaster_contract.v_active_principal_accounts_v1,
        orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        TO jenfu_ai_pdm_runtime`)
      // Migration 062 already grants runtime SELECT on existing app-owned
      // policy tables; this focused fixture otherwise models only the rows
      // needed by earlier 065 checks.
      await client.query(`GRANT SELECT ON ai_pdm_core.role_priority_versions
        TO jenfu_ai_pdm_runtime`)
      await client.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
        (principal_issuer,principal_subject,principal_id,employee_id,account_type,
         contract_version,employee_status,mapping_version,published_at)
        VALUES ('issuer-reviewer','subject-reviewer','principal-one','employee-one',
                'human_personal','organization.active-principal.v1','active',1,clock_timestamp())`)
      await client.query(`INSERT INTO orgmaster_contract.v_ai_pdm_entitlement_authority_v1
        (employee_id,authority_version,contract_version,application_id,authority_source)
        VALUES ('employee-one',1,'jenfu.platform-entitlement.v1','ai-pdm','legacy_authority')`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.roles
        (id,role_code,enabled) VALUES ('role-review-manager','rd_manager',1)`)
      await asRole('jenfu_ai_pdm_migrator', `UPDATE ai_pdm_core.role_priority_versions
        SET priority_json='["rd_manager","pdm_admin","qa","rd"]'
        WHERE id='priority-one'`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.role_permissions
        (id,role_id,permission_kind,permission_code,allowed)
        VALUES ('review-decide','role-review-manager','action','approval.request.decide',1)`)
      await asRole('jenfu_ai_pdm_migrator', `INSERT INTO ai_pdm_core.principal_role_assignments
        (id,principal_id,role_id,origin,scope_template,assigned_at)
        VALUES ('review-manager','principal-one','role-review-manager','principal_assignment',
                'workspace_all','2026-09-24T12:00:00Z')`)
      const read = async () => {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        try {
          await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
          await client.query('SET LOCAL search_path = ai_pdm_core, pg_catalog')
          const query = async (sql, params = {}) => {
            const names = []
            const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
              let index = names.indexOf(name)
              if (index < 0) { names.push(name); index = names.length - 1 }
              return `$${index + 1}`
            })
            return (await client.query(bound, names.map((name) => params[name]))).rows
          }
          const tx = { kind: 'postgres', transactionScope: 'postgres', query,
            queryOne: async (sql, params) => (await query(sql, params))[0] ?? null }
          const reviewer = await selectPrincipalReviewerInSnapshot(tx,
            { companyId: 'company-one', ownerUserId: 'pdm-user-two' })
          await client.query('COMMIT')
          return reviewer
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      }
      assert.equal(await read(), 'pdm-user-one')
      await client.query(`UPDATE orgmaster_contract.v_active_principal_accounts_v1
        SET employee_status='suspended' WHERE principal_issuer='issuer-reviewer'`)
      await assert.rejects(read(), (error) => error?.status === 409)
    })

    await check('principal reviewer selector honors published OrgMaster authority without UID roles', async () => {
      const { selectPrincipalReviewerInSnapshot } = await import(pathToFileURL(
        path.join(root, 'src/lib/repositories/pdm-principal-reviewer-selector.ts')).href)
      await client.query(`UPDATE orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        SET assignment_version_id='reviewer-published-v1', assignment_version=1,
            assignment_id='reviewer-admin-grant',
            catalog_version='ai-pdm.role-catalog.2026-09-25.v4',
            published_at=clock_timestamp()
        WHERE principal_id='principal-admin'`)
      await client.query(`GRANT SELECT ON
        orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        TO jenfu_ai_pdm_runtime`)
      const query = async (sql, params = {}) => {
        const names = []
        const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
          let index = names.indexOf(name)
          if (index < 0) { names.push(name); index = names.length - 1 }
          return `$${index + 1}`
        })
        return (await client.query(bound, names.map((name) => params[name]))).rows
      }
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      try {
        await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
        await client.query('SET LOCAL search_path = ai_pdm_core, pg_catalog')
        const tx = { kind: 'postgres', transactionScope: 'postgres', query,
          queryOne: async (sql, params) => (await query(sql, params))[0] ?? null }
        assert.equal(await selectPrincipalReviewerInSnapshot(tx,
          { companyId: 'company-jenfu', ownerUserId: 'pdm-user-materialize' }),
        'pdm-user-admin')
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    })

    await check('principal DEV-087 receipt commits and replays without legacy identity mappings', async () => {
      const { runPrincipalDev087Command } = await import(pathToFileURL(
        path.join(root, 'src/lib/pdm-principal-dev087-command.ts')).href)
      await client.query(`ALTER TABLE ai_pdm_core.platform_command_receipts
        ADD COLUMN command_name text,
        ADD COLUMN schema_version integer,
        ADD COLUMN idempotency_key text,
        ADD COLUMN correlation_id text,
        ADD COLUMN command_status text,
        ADD COLUMN response_json jsonb,
        ADD COLUMN request_hash text,
        ADD COLUMN effect_key text,
        ADD COLUMN completed_at timestamptz`)
      await client.query(`CREATE UNIQUE INDEX principal_receipt_fixture_key
        ON ai_pdm_core.platform_command_receipts(company_id,command_name,idempotency_key)`)
      await client.query(`CREATE TABLE ai_pdm_core.principal_command_effect_fixture
        (id text PRIMARY KEY,principal_id text NOT NULL)`)
      await client.query(`GRANT SELECT,INSERT,UPDATE ON
        ai_pdm_core.platform_command_receipts TO jenfu_ai_pdm_runtime`)
      await client.query(`GRANT SELECT,INSERT ON
        ai_pdm_core.principal_command_effect_fixture TO jenfu_ai_pdm_runtime`)
      const verified = { profile: { pdmUserId: 'pdm-user-admin', companyId: 'company-jenfu' },
        session: { contractVersion: 'jenfu.ai-pdm-session.v2', appId: 'ai-pdm',
          principalId: 'principal-admin', employeeId: 'employee-admin',
          identityIssuer: 'issuer-admin', identitySubject: 'subject-admin',
          sessionId: 'session-admin', authEpoch: 0, issuedAt: '2026-09-25T00:00:00Z',
          expiresAt: '2026-09-26T00:00:00Z', assuranceLevel: 'aal2' } }
      const input = { command: 'review.decision', idempotencyKey: 'principal-review-one',
        request: { requestId: 'review-one', decision: 'approve', expectedRowVersion: 1 },
        effectKey: 'review:review-one', correlationId: 'principal-review-correlation' }
      const query = async (sql, params = {}) => {
        const names = []
        const bound = sql.replace(/(?<!:):([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
          let index = names.indexOf(name)
          if (index < 0) { names.push(name); index = names.length - 1 }
          return `$${index + 1}`
        })
        return (await client.query(bound, names.map((name) => params[name]))).rows
      }
      const runInSnapshot = async (session, command, effect) => {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        try {
          await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
          await client.query('SET LOCAL search_path = ai_pdm_core, pg_catalog')
          const tx = { kind: 'postgres', transactionScope: 'postgres', query,
            queryOne: async (sql, params) => (await query(sql, params))[0] ?? null,
            execute: async (sql, params) => { await query(sql, params) } }
          const result = await runPrincipalDev087Command(tx, session, command, effect)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw error
        }
      }
      const effect = async (tx) => {
        await tx.execute(`INSERT INTO ai_pdm_core.principal_command_effect_fixture
          VALUES (:id,:principalId)`, { id: 'effect-one', principalId: 'principal-admin' })
        return { acknowledged: true }
      }
      assert.deepEqual(await runInSnapshot(verified, input, effect), { acknowledged: true })
      assert.deepEqual(await runInSnapshot(verified, input,
        async () => { throw new Error('replay must not re-execute') }), { acknowledged: true })
      const receipt = await client.query(`SELECT actor_id,principal_id,
        platform_principal_id,platform_organization_id,response_json
        FROM ai_pdm_core.platform_command_receipts
        WHERE idempotency_key='principal-review-one'`)
      assert.deepEqual([receipt.rows[0].actor_id, receipt.rows[0].principal_id,
        receipt.rows[0].platform_principal_id,receipt.rows[0].platform_organization_id],
      ['pdm-user-admin','principal-admin',null,null])
      assert.deepEqual(receipt.rows[0].response_json.actorBinding,
        { version: 2, actorKind: 'human', principalId: 'principal-admin', companyId: 'company-jenfu' })
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_command_effect_fixture`)).rows[0].n, 1)
      await assert.rejects(runInSnapshot({ ...verified,
        session: { ...verified.session, principalId: 'different-principal' } }, input, effect),
      (error) => error?.status === 422)
      await assert.rejects(runInSnapshot(verified,
        { ...input, idempotencyKey: 'principal-review-rollback' },
        async (tx) => {
          await tx.execute(`INSERT INTO ai_pdm_core.principal_command_effect_fixture
            VALUES (:id,:principalId)`, { id: 'rollback-effect', principalId: 'principal-admin' })
          throw new Error('intentional command failure')
        }), /intentional command failure/)
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.platform_command_receipts
        WHERE idempotency_key='principal-review-rollback'`)).rows[0].n, 0)
      assert.equal((await client.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_command_effect_fixture WHERE id='rollback-effect'`)).rows[0].n, 0)
    })
  }
} finally {
  if (client) await client.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' }); stopped = true }
    catch { stopped = false }
  } else stopped = true
  if (port) released = await portReleased(port)
  if (stopped && released) {
    fs.rmSync(taskRoot, { recursive: true, force: true })
    tempRemoved = !fs.existsSync(taskRoot)
  }
  process.stdout.write(`${JSON.stringify({ project: 'AI-PDM', checksPassed: checks.length,
    productionWrites: false, cleanup: { stopped, released, tempRemoved },
    retainedTempPath: tempRemoved ? null : taskRoot })}\n`)
}
