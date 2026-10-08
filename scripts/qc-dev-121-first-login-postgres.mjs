#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(os.tmpdir())
const taskRoot = fs.mkdtempSync(path.join(tempRoot, 'aipdm-dev121-first-login-pg-'))
assert.ok(taskRoot.startsWith(`${tempRoot}${path.sep}`), 'task-owned PostgreSQL path must remain under TEMP')
const cluster = path.join(taskRoot, 'cluster')
const log = path.join(taskRoot, 'postgres.log')
const bin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const checks = []
let port
let admin
let started = false

function run(name, args, options = {}) {
  const result = spawnSync(path.join(bin, name), args, {
    cwd: root, encoding: 'utf8', windowsHide: true, ...options
  })
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : undefined
      server.close((error) => error ? reject(error) : resolve(selected))
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

async function check(name, action) {
  const detail = await action()
  checks.push({ name, detail })
  process.stdout.write(`PASS ${name}\n`)
}

function connection(applicationName) {
  return new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres',
    application_name: applicationName })
}

async function asRuntime(client, action) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await client.query('SET LOCAL ROLE jenfu_ai_pdm_runtime')
    const result = await action()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function ensure(client, input) {
  return await asRuntime(client, async () => {
    const result = await client.query(`SELECT ai_pdm_core.ensure_authorized_first_login_account_v1(
      $1,$2,$3,$4,$5,$6,$7::timestamptz,$8
    ) AS receipt`, [input.identityIssuer, input.identitySubject, input.principalId,
      input.employeeId, input.accountType, input.mappingVersion, input.publishedAt,
      input.verifiedEmail])
    return result.rows[0].receipt
  })
}

async function ensureWithRetry(client, input) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await ensure(client, input)
    } catch (error) {
      if (attempt < 3 && (error?.code === '40001' || error?.code === '40P01')) continue
      throw error
    }
  }
  throw new Error('FIRST_LOGIN_RETRY_EXHAUSTED')
}

async function addIdentity(input, status = 'active') {
  await admin.query(`INSERT INTO orgmaster_contract.v_active_principal_accounts_v1
    (contract_version,principal_issuer,principal_subject,principal_id,employee_id,
     employee_status,account_type,mapping_version,published_at)
    VALUES ('organization.active-principal.v1',$1,$2,$3,$4,$5,$6,$7,$8::timestamptz)`,
  [input.identityIssuer,input.identitySubject,input.principalId,input.employeeId,status,
    input.accountType,input.mappingVersion,input.publishedAt])
}

async function addGrant(input, overrides = {}) {
  const values = {
    assignmentId: `assignment-${input.principalId}`,
    validFrom: '2026-10-07T00:00:00.000Z',
    validUntil: null,
    scopeKind: 'workspace',
    scopeKey: 'current',
    ...overrides
  }
  await admin.query(`INSERT INTO orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    (contract_version,assignment_version_id,assignment_version,assignment_id,grant_kind,
     delegation_id,application_id,principal_id,employee_id,subject_kind,target_principal_id,
     stable_role_id,role_code,catalog_version,scope_kind,scope_key,valid_from,valid_until,published_at)
    VALUES ('jenfu.orgmaster.ai-pdm-principal-grants.v4','publication-one',1,$1,'direct',
      NULL,'ai-pdm',$2,$3,'employee',NULL,'role-rd','rd','catalog-one',$4,$5,
      $6::timestamptz,$7::timestamptz,'2026-10-07T00:00:00.000Z')`,
  [values.assignmentId,input.principalId,input.employeeId,values.scopeKind,values.scopeKey,
    values.validFrom,values.validUntil])
}

function fixture(name) {
  return {
    identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
    identitySubject: `subject-${name}`,
    principalId: `principal-${name}`,
    employeeId: `employee-${name}`,
    accountType: 'human_personal',
    mappingVersion: 1,
    publishedAt: '2026-10-08T00:00:00.000Z',
    verifiedEmail: `${name}@jenfu.com.tw`
  }
}

try {
  port = await freePort()
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-121 authorized first-login atomic PostgreSQL QC', port,
    owningProcessTree: 'qc-dev-121-first-login-postgres.mjs -> task-owned PostgreSQL cluster',
    cleanupCondition: 'clients closed, cluster stopped, port released, temporary root removed',
    mutationScope: taskRoot, productionWrites: false
  } })}\n`)
  run('initdb.exe', ['-D', cluster, '--auth-local=trust', '--auth-host=trust',
    '--username=postgres', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl.exe', ['-D', cluster, '-l', log, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'],
    { stdio: 'ignore' })
  started = true
  admin = connection('aipdm-dev121-first-login-admin')
  await admin.connect()
  await admin.query(`
    CREATE ROLE jenfu_ai_pdm_migrator NOLOGIN;
    CREATE ROLE jenfu_ai_pdm_runtime NOLOGIN;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA ai_pdm_contract AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA orgmaster_contract;
    CREATE TABLE ai_pdm_core.companies (
      id text PRIMARY KEY, company_code text NOT NULL, company_kind text NOT NULL,
      display_name text NOT NULL
    );
    CREATE TABLE ai_pdm_core.users (
      id text PRIMARY KEY, display_name text NOT NULL, email text UNIQUE, password_hash text,
      role text NOT NULL, company_id text NOT NULL REFERENCES ai_pdm_core.companies(id),
      account_status text NOT NULL CHECK (account_status IN ('active','suspended','expired','offboarded')),
      system_role_enabled integer NOT NULL CHECK (system_role_enabled IN (0,1)),
      account_status_changed_at timestamptz, account_status_reason text,
      CONSTRAINT users_profile_company_pair_v1 UNIQUE (id,company_id)
    );
    CREATE TABLE ai_pdm_core.principal_identity_operations (
      operation_id text PRIMARY KEY, operation_kind text NOT NULL
        CHECK (operation_kind IN ('cutover','provision','lifecycle')),
      input_hash char(64) NOT NULL, cohort_hash char(64) NOT NULL,
      result_json jsonb NOT NULL, committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE ai_pdm_core.principal_accounts (
      principal_id text PRIMARY KEY, pdm_user_id text NOT NULL UNIQUE,
      company_id text NOT NULL REFERENCES ai_pdm_core.companies(id),
      employee_id text NOT NULL, account_type text NOT NULL,
      account_status text NOT NULL CHECK (account_status IN ('active','suspended','expired','offboarded')),
      lifecycle_version bigint NOT NULL, session_invalid_before timestamptz,
      profile_version bigint NOT NULL, system_role_enabled boolean NOT NULL,
      minimum_assurance text NOT NULL,
      CONSTRAINT principal_profile_company_pair FOREIGN KEY (pdm_user_id,company_id)
        REFERENCES ai_pdm_core.users(id,company_id),
      CONSTRAINT principal_account_profile_pair UNIQUE (pdm_user_id,principal_id),
      CONSTRAINT principal_account_provenance_triplet UNIQUE (company_id,pdm_user_id,principal_id)
    );
    CREATE TABLE ai_pdm_core.principal_identity_cutovers (
      pdm_user_id text PRIMARY KEY REFERENCES ai_pdm_core.users(id),
      principal_id text UNIQUE, status text NOT NULL,
      source_hash char(64) NOT NULL, operation_id text REFERENCES ai_pdm_core.principal_identity_operations(operation_id),
      activated_at timestamptz,
      CONSTRAINT principal_cutover_active_profile_pair FOREIGN KEY (pdm_user_id,principal_id)
        REFERENCES ai_pdm_core.principal_accounts(pdm_user_id,principal_id)
        DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TABLE ai_pdm_contract.v_application_role_catalog_v1 (
      stable_role_id text, role_code text, contract_version text, application_id text,
      assignable boolean, subject_kind text, allowed_scope_kinds jsonb, permissions jsonb
    );
    CREATE TABLE orgmaster_contract.v_active_principal_accounts_v1 (
      contract_version text, principal_issuer text, principal_subject text, principal_id text,
      employee_id text, employee_status text, account_type text,
      mapping_version bigint, published_at timestamptz
    );
    CREATE TABLE orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 (
      contract_version text, assignment_version_id text, assignment_version bigint,
      assignment_id text, grant_kind text, delegation_id text, application_id text,
      principal_id text, employee_id text, subject_kind text, target_principal_id text,
      stable_role_id text, role_code text, catalog_version text, scope_kind text,
      scope_key text, valid_from timestamptz, valid_until timestamptz, published_at timestamptz
    );
    ALTER TABLE ai_pdm_core.companies OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.users OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.principal_identity_operations OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.principal_accounts OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_core.principal_identity_cutovers OWNER TO jenfu_ai_pdm_migrator;
    ALTER TABLE ai_pdm_contract.v_application_role_catalog_v1 OWNER TO jenfu_ai_pdm_migrator;
    GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
    GRANT USAGE ON SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA orgmaster_contract TO jenfu_ai_pdm_migrator;
    INSERT INTO ai_pdm_core.companies VALUES ('company-jenfu','JENFU','business','Jenfu');
    INSERT INTO ai_pdm_contract.v_application_role_catalog_v1 VALUES
      ('role-rd','rd','jenfu.platform-entitlement.v1','ai-pdm',true,'employee',
       '["workspace","project"]'::jsonb,'[]'::jsonb);
  `)
  const migration = fs.readFileSync(path.join(root,
    'db/postgres/083_dev121_authorized_first_login_account.sql'), 'utf8')
  await admin.query(migration)

  await check('no effective grant creates no local account or receipt', async () => {
    const input = fixture('no-grant')
    await addIdentity(input)
    await assert.rejects(ensure(admin, input), (error) => error?.code === '42501' &&
      /AIPDM_FIRST_LOGIN_UNAUTHORIZED/u.test(error.message))
    const count = await admin.query(`SELECT
      (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts WHERE principal_id=$1) accounts,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_operations
        WHERE result_json->>'principalId'=$1) operations`, [input.principalId])
    assert.deepEqual(count.rows[0], { accounts: 0, operations: 0 })
    return count.rows[0]
  })

  await check('valid identity and grant create one complete active account and replay it', async () => {
    const input = fixture('first-login')
    await addIdentity(input)
    await addGrant(input)
    const first = await ensure(admin, input)
    const replay = await ensure(admin, input)
    assert.equal(first.created, true)
    assert.equal(replay.created, false)
    assert.equal(replay.pdmUserId, first.pdmUserId)
    const rows = await admin.query(`SELECT profile.display_name,profile.email,
      profile.account_status AS profile_status,profile.system_role_enabled AS profile_enabled,
      account.account_status,account.system_role_enabled,account.employee_id,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_operations
        WHERE result_json->>'principalId'=$1) operations,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_cutovers
        WHERE principal_id=$1) cutovers
      FROM ai_pdm_core.principal_accounts account
      JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id
      WHERE account.principal_id=$1`, [input.principalId])
    assert.deepEqual(rows.rows[0], { display_name: input.verifiedEmail, email: null,
      profile_status: 'active', profile_enabled: 1, account_status: 'active',
      system_role_enabled: true, employee_id: input.employeeId, operations: 1, cutovers: 1 })
    return { pdmUserId: first.pdmUserId, replayCreated: replay.created }
  })

  await check('parallel first logins converge to one profile and one principal account', async () => {
    const input = fixture('parallel')
    await addIdentity(input)
    await addGrant(input, { assignmentId: 'assignment-parallel' })
    const left = connection('aipdm-first-login-parallel-left')
    const right = connection('aipdm-first-login-parallel-right')
    await Promise.all([left.connect(), right.connect()])
    try {
      const receipts = await Promise.all([ensureWithRetry(left, input), ensureWithRetry(right, input)])
      assert.equal(new Set(receipts.map((item) => item.pdmUserId)).size, 1)
      assert.deepEqual(receipts.map((item) => item.created).sort(), [false,true])
      const count = await admin.query(`SELECT count(*)::integer AS n
        FROM ai_pdm_core.principal_accounts WHERE principal_id=$1`, [input.principalId])
      assert.equal(count.rows[0].n, 1)
      return { accountCount: count.rows[0].n, created: receipts.map((item) => item.created) }
    } finally {
      await Promise.all([left.end(), right.end()])
    }
  })

  await check('suspended local account is never reactivated by first login', async () => {
    const input = fixture('suspended')
    await addIdentity(input)
    await addGrant(input, { assignmentId: 'assignment-suspended' })
    const created = await ensure(admin, input)
    await admin.query(`UPDATE ai_pdm_core.principal_accounts
      SET account_status='suspended',system_role_enabled=false WHERE principal_id=$1`, [input.principalId])
    await admin.query(`UPDATE ai_pdm_core.users
      SET account_status='suspended',system_role_enabled=0 WHERE id=$1`, [created.pdmUserId])
    const replay = await ensure(admin, input)
    assert.equal(replay.created, false)
    assert.equal(replay.accountStatus, 'suspended')
    const state = await admin.query(`SELECT account_status,system_role_enabled
      FROM ai_pdm_core.principal_accounts WHERE principal_id=$1`, [input.principalId])
    assert.deepEqual(state.rows[0], { account_status: 'suspended', system_role_enabled: false })
    return state.rows[0]
  })

  await check('inactive identity, expired grant and identity mismatch create no account', async () => {
    const inactive = fixture('offboarded')
    await addIdentity(inactive, 'offboarded')
    await addGrant(inactive, { assignmentId: 'assignment-offboarded' })
    await assert.rejects(ensure(admin, inactive), /AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT/u)
    const expired = fixture('expired-grant')
    await addIdentity(expired)
    await addGrant(expired, { assignmentId: 'assignment-expired',
      validUntil: '2026-10-07T12:00:00.000Z' })
    await assert.rejects(ensure(admin, expired), /AIPDM_FIRST_LOGIN_UNAUTHORIZED/u)
    const mismatch = fixture('identity-mismatch')
    await addIdentity(mismatch)
    await addGrant(mismatch, { assignmentId: 'assignment-mismatch' })
    await assert.rejects(ensure(admin, { ...mismatch, employeeId: 'employee-other' }),
      /AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT/u)
    const count = await admin.query(`SELECT count(*)::integer AS n
      FROM ai_pdm_core.principal_accounts
      WHERE principal_id=ANY($1::text[])`, [[inactive.principalId,expired.principalId,mismatch.principalId]])
    assert.equal(count.rows[0].n, 0)
    return { rejectedAccountCount: count.rows[0].n }
  })

  await check('historical email similarity is untouched and is not used as an account link', async () => {
    const input = fixture('historical')
    input.verifiedEmail = 'dani@jenfu.com.tw'
    await admin.query(`INSERT INTO ai_pdm_core.users
      (id,display_name,email,password_hash,role,company_id,account_status,
       system_role_enabled,account_status_changed_at,account_status_reason)
      VALUES ('prod-pdm-wave0-dani-001','Historical unrelated profile',$1,NULL,'Engineer',
        'company-jenfu','active',1,clock_timestamp(),'historical_fixture')`, [input.verifiedEmail])
    await addIdentity(input)
    await addGrant(input, { assignmentId: 'assignment-historical' })
    const created = await ensure(admin, input)
    assert.notEqual(created.pdmUserId, 'prod-pdm-wave0-dani-001')
    const rows = await admin.query(`SELECT id,display_name,email FROM ai_pdm_core.users
      WHERE id IN ('prod-pdm-wave0-dani-001',$1) ORDER BY id`, [created.pdmUserId])
    assert.equal(rows.rows.length, 2)
    assert.deepEqual(rows.rows.find((row) => row.id === 'prod-pdm-wave0-dani-001'), {
      id: 'prod-pdm-wave0-dani-001', display_name: 'Historical unrelated profile',
      email: input.verifiedEmail
    })
    assert.equal(rows.rows.find((row) => row.id === created.pdmUserId)?.email, null)
    return { historicalUntouched: true, createdPdmUserId: created.pdmUserId }
  })

  await check('downstream failure rolls back profile, link, receipt and cutover together', async () => {
    const input = fixture('rollback')
    await addIdentity(input)
    await addGrant(input, { assignmentId: 'assignment-rollback' })
    await admin.query(`CREATE FUNCTION ai_pdm_core.qc_fail_rollback_cutover() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.principal_id='principal-rollback' THEN RAISE EXCEPTION 'QC_FORCED_ROLLBACK'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER qc_fail_rollback_cutover BEFORE INSERT ON ai_pdm_core.principal_identity_cutovers
      FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.qc_fail_rollback_cutover();`)
    await assert.rejects(ensure(admin, input), /QC_FORCED_ROLLBACK/u)
    const counts = await admin.query(`SELECT
      (SELECT count(*)::integer FROM ai_pdm_core.users WHERE display_name=$1) users,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_accounts WHERE principal_id=$2) accounts,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_operations
        WHERE result_json->>'principalId'=$2) operations,
      (SELECT count(*)::integer FROM ai_pdm_core.principal_identity_cutovers
        WHERE principal_id=$2) cutovers`, [input.verifiedEmail,input.principalId])
    assert.deepEqual(counts.rows[0], { users: 0, accounts: 0, operations: 0, cutovers: 0 })
    return counts.rows[0]
  })

  process.stdout.write(`${JSON.stringify({ runner: 'DEV-121 authorized first-login PostgreSQL QC',
    status: 'PASS', productionWrites: false, executedCaseCount: checks.length, checks })}\n`)
} catch (error) {
  process.stderr.write(`${JSON.stringify({ runner: 'DEV-121 authorized first-login PostgreSQL QC',
    status: 'FAIL', productionWrites: false, checks,
    error: error instanceof Error ? error.stack ?? error.message : String(error) })}\n`)
  process.exitCode = 1
} finally {
  await admin?.end().catch(() => undefined)
  if (started) {
    try { run('pg_ctl.exe', ['-D', cluster, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' }) }
    catch { /* final state below stays observable */ }
  }
  const released = port ? await portReleased(port) : true
  fs.rmSync(taskRoot, { recursive: true, force: true })
  process.stdout.write(`${JSON.stringify({ cleanup: { portReleased: released,
    tempRemoved: !fs.existsSync(taskRoot), productionWrites: false } })}\n`)
}
