#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = process.cwd();
const tempBase = path.resolve(os.tmpdir());
const taskRoot = fs.mkdtempSync(path.join(tempBase, "aipdm-dev125-device-"));
assert.ok(taskRoot.startsWith(`${tempBase}${path.sep}`));
const cluster = path.join(taskRoot, "cluster");
const log = path.join(taskRoot, "postgres.log");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
let port;
let started = false;
let admin;
let runtime;
const checks = [];

function run(name, args, options = {}) {
  const result = spawnSync(path.join(postgresBin, name), args, {
    cwd: root, encoding: "utf8", windowsHide: true, ...options
  });
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout || "").trim()}`);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function portReleased(value) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: value });
    socket.setTimeout(750);
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(true));
  });
}

async function check(name, action) {
  await action();
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

function token(fill) { return Buffer.alloc(32, fill).toString("base64url"); }
function hash(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function uuid() { return crypto.randomUUID(); }
async function expectCode(action, code) {
  await assert.rejects(action, (error) => error?.code === code);
}

try {
  port = await freePort();
  process.stdout.write(`${JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-125 Windows device enrollment, instance, and revocation PostgreSQL verification",
    port,
    owningProcessTree: "qc-dev125-windows-service-postgres.mjs -> task-owned PostgreSQL cluster",
    cleanupCondition: "clients closed, cluster stopped, port released, exact temporary root removed",
    PDM_DATA_DIR: path.join(taskRoot, "data"),
    PDM_REPOSITORY_DIR: path.join(taskRoot, "repository"),
    mutationScope: taskRoot,
    productionWrites: false
  } })}\n`);
  run("initdb.exe", ["-D", cluster, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl.exe", ["-D", cluster, "-l", log, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  admin = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`
    CREATE ROLE jenfu_ai_pdm_migrator;
    CREATE ROLE jenfu_ai_pdm_runtime LOGIN;
    CREATE ROLE jenfu_platform_runtime;
    CREATE ROLE jenfu_orgmaster_runtime;
    CREATE ROLE jenfu_r1_verifier;
    CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;
    CREATE SCHEMA platform_contract;
    CREATE SCHEMA orgmaster_contract;
    SET ROLE jenfu_ai_pdm_migrator;
    CREATE TABLE ai_pdm_core.companies (id text PRIMARY KEY);
    CREATE TABLE ai_pdm_core.users (id text PRIMARY KEY, company_id text NOT NULL REFERENCES ai_pdm_core.companies(id));
    CREATE TABLE ai_pdm_core.principal_accounts (
      principal_id text PRIMARY KEY, company_id text NOT NULL REFERENCES ai_pdm_core.companies(id),
      pdm_user_id text NOT NULL REFERENCES ai_pdm_core.users(id), employee_id text NOT NULL,
      account_type text NOT NULL, account_status text NOT NULL,
      lifecycle_version bigint NOT NULL, profile_version bigint NOT NULL,
      system_role_enabled boolean NOT NULL, minimum_assurance text NOT NULL,
      session_invalid_before timestamptz
    );
    CREATE TABLE ai_pdm_core.principal_session_records (
      principal_id text NOT NULL REFERENCES ai_pdm_core.principal_accounts(principal_id),
      session_id_hash char(64) NOT NULL, principal_auth_epoch bigint NOT NULL,
      lifecycle_version bigint NOT NULL, profile_version bigint NOT NULL,
      authenticated_at timestamptz NOT NULL, issued_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL, revoked_at timestamptz, assurance_level text NOT NULL,
      PRIMARY KEY(principal_id,session_id_hash)
    );
    CREATE TABLE ai_pdm_core.employee_login_rate_limits (
      company_id text NOT NULL REFERENCES ai_pdm_core.companies(id), identifier_hash text NOT NULL,
      window_started_at timestamptz NOT NULL, attempt_count integer NOT NULL,
      blocked_until timestamptz, updated_at timestamptz NOT NULL,
      PRIMARY KEY(company_id,identifier_hash)
    );
    CREATE TABLE ai_pdm_core.audit_logs (
      id text PRIMARY KEY, submission_id text, actor_id text, action text NOT NULL,
      detail_json jsonb NOT NULL, company_id text, scope_kind text NOT NULL, created_at timestamptz NOT NULL
    );
    CREATE TABLE ai_pdm_core.preview_jobs (
      id text PRIMARY KEY, company_id text NOT NULL, status text NOT NULL,
      locked_by text, attempt_count integer NOT NULL DEFAULT 0, locked_at timestamptz,
      source_content_hash text
    );
    CREATE TABLE ai_pdm_core.drawing_recognition_sessions (
      id text PRIMARY KEY, company_id text NOT NULL, status text NOT NULL,
      locked_by text, attempt_count integer NOT NULL DEFAULT 0, locked_at timestamptz,
      source_set_fingerprint text
    );
    CREATE TABLE ai_pdm_core.settings_secret_probe_jobs (
      id text PRIMARY KEY, company_id text NOT NULL, status text NOT NULL,
      locked_by text, attempt_count integer NOT NULL DEFAULT 0, locked_at timestamptz
    );
    CREATE TABLE ai_pdm_core.worker_capability_heartbeats (
      worker_id text NOT NULL, capability_code text NOT NULL, status text NOT NULL,
      reader_version text, last_seen_at timestamptz NOT NULL,
      PRIMARY KEY(worker_id,capability_code)
    );
    RESET ROLE;
    CREATE FUNCTION platform_contract.read_principal_auth_state_v3(subject text)
      RETURNS TABLE(principal_id text,auth_epoch bigint,revoked_before timestamptz)
      LANGUAGE sql STABLE AS $$ SELECT subject,7::bigint,NULL::timestamptz $$;
    CREATE TABLE orgmaster_contract.test_active_principal_accounts (
      contract_version text NOT NULL, principal_issuer text NOT NULL, principal_subject text NOT NULL,
      principal_id text NOT NULL, employee_id text NOT NULL, employee_status text NOT NULL
    );
    CREATE VIEW orgmaster_contract.v_active_principal_accounts_v1 AS
      SELECT * FROM orgmaster_contract.test_active_principal_accounts;
    CREATE TABLE orgmaster_contract.test_ai_pdm_principal_grants (
      contract_version text NOT NULL, assignment_version_id text NOT NULL, assignment_version bigint NOT NULL,
      assignment_id text NOT NULL, grant_kind text NOT NULL, delegation_id text,
      application_id text NOT NULL, principal_id text NOT NULL, employee_id text NOT NULL,
      subject_kind text NOT NULL, target_principal_id text, stable_role_id text NOT NULL,
      role_code text NOT NULL, catalog_version text NOT NULL, scope_kind text NOT NULL,
      scope_key text, valid_from timestamptz NOT NULL, valid_until timestamptz, published_at timestamptz NOT NULL
    );
    CREATE VIEW orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 AS
      SELECT * FROM orgmaster_contract.test_ai_pdm_principal_grants;
    GRANT USAGE ON SCHEMA ai_pdm_core,platform_contract,orgmaster_contract TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON ai_pdm_core.users,ai_pdm_core.principal_accounts,ai_pdm_core.principal_session_records,
      ai_pdm_core.preview_jobs,ai_pdm_core.drawing_recognition_sessions,
      ai_pdm_core.settings_secret_probe_jobs,ai_pdm_core.worker_capability_heartbeats TO jenfu_ai_pdm_runtime;
    GRANT SELECT,INSERT,UPDATE ON ai_pdm_core.employee_login_rate_limits TO jenfu_ai_pdm_runtime;
    GRANT INSERT ON ai_pdm_core.audit_logs TO jenfu_ai_pdm_runtime;
    GRANT SELECT ON orgmaster_contract.v_active_principal_accounts_v1,
      orgmaster_contract.v_ai_pdm_principal_effective_grants_v4 TO jenfu_ai_pdm_runtime;
    GRANT EXECUTE ON FUNCTION platform_contract.read_principal_auth_state_v3(text) TO jenfu_ai_pdm_runtime;
    INSERT INTO ai_pdm_core.companies VALUES ('company-jenfu');
    INSERT INTO ai_pdm_core.users VALUES ('profile-rd','company-jenfu'),('profile-b','company-jenfu');
    INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,company_id,pdm_user_id,employee_id,account_type,account_status,lifecycle_version,
       profile_version,system_role_enabled,minimum_assurance,session_invalid_before) VALUES
      ('principal-rd','company-jenfu','profile-rd','employee-rd','human_personal','active',1,1,true,'aal1',NULL),
      ('principal-b','company-jenfu','profile-b','employee-b','human_personal','active',1,1,true,'aal1',NULL);
    INSERT INTO ai_pdm_core.principal_session_records VALUES
      ('principal-rd',repeat('1',64),7,1,1,now()-interval '1 minute',now()-interval '1 minute',
       now()+interval '1 hour',NULL,'aal1'),
      ('principal-b',repeat('2',64),7,1,1,now()-interval '1 minute',now()-interval '1 minute',
       now()+interval '1 hour',NULL,'aal1');
    INSERT INTO orgmaster_contract.test_active_principal_accounts VALUES
      ('organization.active-principal.v1','https://accounts.google.com','subject-rd','principal-rd','employee-rd','active'),
      ('organization.active-principal.v1','https://accounts.google.com','subject-b','principal-b','employee-b','active');
    INSERT INTO orgmaster_contract.test_ai_pdm_principal_grants VALUES
      ('jenfu.orgmaster.ai-pdm-principal-grants.v4','version-current',1,'assignment-rd','direct',NULL,
       'ai-pdm','principal-rd','employee-rd','employee',NULL,'role-rd','rd',
       'ai-pdm.role-catalog.2026-09-03.v3','global',NULL,now()-interval '1 day',NULL,now()-interval '1 day'),
      ('jenfu.orgmaster.ai-pdm-principal-grants.v4','version-current',1,'assignment-b','direct',NULL,
       'ai-pdm','principal-b','employee-b','employee',NULL,'role-production','production',
       'ai-pdm.role-catalog.2026-09-03.v3','global',NULL,now()-interval '1 day',NULL,now()-interval '1 day');
  `);
  await admin.query(fs.readFileSync(path.join(root, "db/postgres/089_dev125_windows_service_devices.sql"), "utf8"));
  const legacyDeviceId = uuid();
  await admin.query(`
    INSERT INTO ai_pdm_core.windows_service_devices
      (id,company_id,name,credential_hash,status,service_version,protocol_version,registered_by)
    VALUES ($1,'company-jenfu','LEGACY-RD',$2,'active','0.0.9',1,'principal-rd')
  `, [legacyDeviceId, hash(token(20))]);
  await admin.query(fs.readFileSync(path.join(root, "db/postgres/090_dev125_windows_device_owner_principal.sql"), "utf8"));
  await check("migration 090 backfills the permanent Principal owner without changing migration 089", async () => {
    const row = await admin.query("SELECT owner_principal_id FROM ai_pdm_core.windows_service_devices WHERE id=$1", [legacyDeviceId]);
    assert.equal(row.rows[0].owner_principal_id, "principal-rd");
  });

  const [{ createAsyncDatabaseClient }, devices] = await Promise.all([
    import("../src/lib/db-async-provider.ts"), import("../src/lib/windows-service-devices.ts")
  ]);
  runtime = createAsyncDatabaseClient({
    kind: "postgres",
    connectionString: `postgresql://jenfu_ai_pdm_runtime@127.0.0.1:${port}/postgres`,
    searchPath: "ai_pdm_core,pg_catalog", maxConnections: 4, statementTimeoutMillis: 5_000
  });
  const repository = new devices.WindowsServiceDeviceRepository(runtime);
  const creator = {
    companyId: "company-jenfu", createdBy: "principal-rd", creatorSessionHash: "1".repeat(64),
    creatorAuthEpoch: 7, creatorIdentityIssuer: "https://accounts.google.com", creatorIdentitySubject: "subject-rd"
  };

  const enrollmentCode = token(1);
  const requestId = uuid();
  const codeHash = hash(enrollmentCode);
  const createInput = {
    ...creator, requestId, codeHash,
    requestHash: devices.windowsServiceRequestHash({ companyId: creator.companyId, requestId, codeHash })
  };
  let enrollment;
  await check("one enrollment request is idempotent and conflicting request reuse is rejected", async () => {
    const first = await repository.createEnrollment(createInput);
    const retry = await repository.createEnrollment(createInput);
    enrollment = first.enrollment;
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.enrollment.id, first.enrollment.id);
    await expectCode(() => repository.createEnrollment({ ...createInput, codeHash: "2".repeat(64) }), "WINDOWS_SERVICE_REQUEST_ID_REUSE");
  });

  const deviceToken = token(2);
  const deviceId = uuid();
  const enrollInput = {
    enrollmentId: enrollment.id, code: enrollmentCode, deviceId,
    credentialHash: hash(deviceToken), name: "DEV125-PC", serviceVersion: "0.1.0",
    protocolVersion: 1, sourceKey: "source-success"
  };
  await check("enrollment consumes once and exact response-loss retry does not create another device", async () => {
    const first = await repository.enroll(enrollInput);
    const retry = await repository.enroll(enrollInput);
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    const count = await admin.query("SELECT count(*)::int AS count FROM ai_pdm_core.windows_service_devices");
    assert.equal(count.rows[0].count, 2);
  });

  await check("wrong codes persist rate-limit state and the eleventh source attempt is blocked", async () => {
    const value = token(3);
    const request = uuid();
    const valueHash = hash(value);
    const created = await repository.createEnrollment({
      ...creator, requestId: request, codeHash: valueHash,
      requestHash: devices.windowsServiceRequestHash({ companyId: creator.companyId, requestId: request, codeHash: valueHash })
    });
    const wrong = { ...enrollInput, enrollmentId: created.enrollment.id, code: token(4),
      deviceId: uuid(), credentialHash: hash(token(5)), sourceKey: "source-rate-limit" };
    for (let index = 0; index < 10; index += 1) {
      await expectCode(() => repository.enroll(wrong), "WINDOWS_SERVICE_ENROLLMENT_INVALID");
    }
    await expectCode(() => repository.enroll(wrong), "WINDOWS_SERVICE_RATE_LIMITED");
    const row = await admin.query("SELECT max(attempt_count)::int AS attempts FROM ai_pdm_core.employee_login_rate_limits WHERE blocked_until IS NOT NULL");
    assert.equal(row.rows[0].attempts, 11);
  });

  await check("expired enrollment and revoked creator session are rejected without a device row", async () => {
    const make = async (fill) => {
      const value = token(fill); const request = uuid(); const valueHash = hash(value);
      const created = await repository.createEnrollment({ ...creator, requestId: request, codeHash: valueHash,
        requestHash: devices.windowsServiceRequestHash({ companyId: creator.companyId, requestId: request, codeHash: valueHash }) });
      return { value, enrollment: created.enrollment };
    };
    const expired = await make(6);
    await admin.query("UPDATE ai_pdm_core.windows_service_enrollments SET created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' WHERE id=$1", [expired.enrollment.id]);
    await expectCode(() => repository.enroll({ ...enrollInput, enrollmentId: expired.enrollment.id,
      code: expired.value, deviceId: uuid(), credentialHash: hash(token(7)), sourceKey: "source-expired" }), "WINDOWS_SERVICE_ENROLLMENT_EXPIRED");
    const revoked = await make(8);
    await admin.query("UPDATE ai_pdm_core.principal_session_records SET revoked_at=now() WHERE principal_id='principal-rd'");
    await expectCode(() => repository.enroll({ ...enrollInput, enrollmentId: revoked.enrollment.id,
      code: revoked.value, deviceId: uuid(), credentialHash: hash(token(9)), sourceKey: "source-revoked-session" }), "WINDOWS_SERVICE_ENROLLMENT_INVALID");
    await admin.query("UPDATE ai_pdm_core.principal_session_records SET revoked_at=NULL WHERE principal_id='principal-rd'");
  });

  let active;
  const instanceId = uuid();
  await check("one current instance starts idempotently and a fresh competing instance is rejected", async () => {
    const found = await repository.findAuthorizedByCredentialHash(hash(deviceToken));
    assert.equal(found.device.id, deviceId);
    active = await repository.start({ credentialHash: hash(deviceToken), deviceId, companyId: "company-jenfu",
      instanceId, expectedRowVersion: found.device.rowVersion, serviceVersion: "0.1.0", protocolVersion: 1 });
    const retry = await repository.start({ credentialHash: hash(deviceToken), deviceId, companyId: "company-jenfu",
      instanceId, expectedRowVersion: found.device.rowVersion, serviceVersion: "0.1.0", protocolVersion: 1 });
    assert.equal(retry.instanceId, instanceId);
    await expectCode(() => repository.start({ credentialHash: hash(deviceToken), deviceId, companyId: "company-jenfu",
      instanceId: uuid(), expectedRowVersion: active.rowVersion, serviceVersion: "0.1.0", protocolVersion: 1 }), "WINDOWS_SERVICE_INSTANCE_CONFLICT");
  });

  await check("RD, procurement and manufacturing self-enroll independent computers without an administrator role", async () => {
    const deviceIds = new Set();
    const credentialHashes = new Set();
    for (const role of [
      { code: "rd", stableId: "role-rd" },
      { code: "procurement", stableId: "role-procurement" },
      { code: "manufacturing", stableId: "role-manufacturing" }
    ]) {
      const principalId = `selflink-${role.code}`;
      const employeeId = `employee-${principalId}`;
      const profileId = `profile-${principalId}`;
      const subject = `subject-${principalId}`;
      const sessionHash = hash(`session-${principalId}`);
      await admin.query("INSERT INTO ai_pdm_core.users VALUES ($1,'company-jenfu')", [profileId]);
      await admin.query(`
        INSERT INTO ai_pdm_core.principal_accounts VALUES
          ($1,'company-jenfu',$2,$3,'human_personal','active',1,1,true,'aal1',NULL)
      `, [principalId, profileId, employeeId]);
      await admin.query(`
        INSERT INTO ai_pdm_core.principal_session_records VALUES
          ($1,$2,7,1,1,now()-interval '1 minute',now()-interval '1 minute',
           now()+interval '1 hour',NULL,'aal1')
      `, [principalId, sessionHash]);
      await admin.query(`
        INSERT INTO orgmaster_contract.test_active_principal_accounts VALUES
          ('organization.active-principal.v1','https://accounts.google.com',$1,$2,$3,'active')
      `, [subject, principalId, employeeId]);
      await admin.query(`
        INSERT INTO orgmaster_contract.test_ai_pdm_principal_grants VALUES
          ('jenfu.orgmaster.ai-pdm-principal-grants.v4','version-current',1,$1,'direct',NULL,
           'ai-pdm',$2,$3,'employee',NULL,$4,$5,
           'ai-pdm.role-catalog.2026-09-03.v3','global',NULL,now()-interval '1 day',NULL,now()-interval '1 day')
      `, [`assignment-${principalId}`, principalId, employeeId, role.stableId, role.code]);
      const grantedRoles = await admin.query(`
        SELECT role_code FROM orgmaster_contract.test_ai_pdm_principal_grants WHERE principal_id=$1
      `, [principalId]);
      assert.deepEqual(grantedRoles.rows.map((row) => row.role_code), [role.code]);
      const owned = [];
      for (let computer = 1; computer <= 2; computer += 1) {
        const code = crypto.randomBytes(32).toString("base64url");
        const credentialHash = hash(crypto.randomBytes(32).toString("base64url"));
        const requestId = uuid();
        const codeHash = hash(code);
        const enrollment = await repository.createEnrollment({
          companyId: "company-jenfu", createdBy: principalId, creatorSessionHash: sessionHash,
          creatorAuthEpoch: 7, creatorIdentityIssuer: "https://accounts.google.com",
          creatorIdentitySubject: subject, requestId, codeHash,
          requestHash: devices.windowsServiceRequestHash({ companyId: "company-jenfu", requestId, codeHash })
        });
        const created = await repository.enroll({
          enrollmentId: enrollment.enrollment.id, code, credentialHash, deviceId: uuid(),
          name: `${role.code}-PC-${computer}`, serviceVersion: "test-selflink", protocolVersion: 1,
          sourceKey: `source-${principalId}-${computer}`
        });
        assert.equal(created.created, true);
        assert.equal(created.device.ownerPrincipalId, principalId);
        const authorized = await repository.findAuthorizedByCredentialHash(credentialHash);
        assert.equal(authorized.owner.principalId, principalId);
        deviceIds.add(created.device.id);
        credentialHashes.add(credentialHash);
        owned.push({ device: created.device, credentialHash });
      }
      const listed = await repository.list("company-jenfu", principalId);
      assert.deepEqual(new Set(listed.map((row) => row.id)), new Set(owned.map((row) => row.device.id)));
      await expectCode(() => repository.revoke({
        companyId: "company-jenfu", deviceId: owned[0].device.id,
        expectedRowVersion: owned[0].device.rowVersion, actorPrincipalId: "principal-rd", canManageAll: false
      }), "WINDOWS_SERVICE_DEVICE_FORBIDDEN");
      await repository.revoke({
        companyId: "company-jenfu", deviceId: owned[0].device.id,
        expectedRowVersion: owned[0].device.rowVersion, actorPrincipalId: principalId, canManageAll: false
      });
      assert.equal(await repository.findAuthorizedByCredentialHash(owned[0].credentialHash), null);
      assert.equal((await repository.findAuthorizedByCredentialHash(owned[1].credentialHash)).device.id, owned[1].device.id);
    }
    assert.equal(deviceIds.size, 6);
    assert.equal(credentialHashes.size, 6);
  });

  await check("removing, changing or making the owner Principal mapping ambiguous denies the next authentication", async () => {
    assert.equal((await repository.findAuthorizedByCredentialHash(hash(deviceToken))).owner.principalId, "principal-rd");
    const removed = await admin.query(`
      DELETE FROM orgmaster_contract.test_active_principal_accounts WHERE principal_id='principal-rd' RETURNING *
    `);
    try {
      assert.equal(await repository.findAuthorizedByCredentialHash(hash(deviceToken)), null);
    } finally {
      const row = removed.rows[0];
      await admin.query(`
        INSERT INTO orgmaster_contract.test_active_principal_accounts VALUES ($1,$2,$3,$4,$5,$6)
      `, [row.contract_version, row.principal_issuer, row.principal_subject, row.principal_id,
        row.employee_id, row.employee_status]);
    }
    await admin.query(`
      UPDATE orgmaster_contract.test_active_principal_accounts SET employee_id='employee-b' WHERE principal_id='principal-rd'
    `);
    try {
      assert.equal(await repository.findAuthorizedByCredentialHash(hash(deviceToken)), null);
    } finally {
      await admin.query(`
        UPDATE orgmaster_contract.test_active_principal_accounts SET employee_id='employee-rd' WHERE principal_id='principal-rd'
      `);
    }
    await admin.query(`
      INSERT INTO orgmaster_contract.test_active_principal_accounts
      SELECT contract_version,principal_issuer,'ambiguous-subject',principal_id,employee_id,employee_status
      FROM orgmaster_contract.test_active_principal_accounts WHERE principal_id='principal-rd'
    `);
    try {
      assert.equal(await repository.findAuthorizedByCredentialHash(hash(deviceToken)), null);
    } finally {
      await admin.query("DELETE FROM orgmaster_contract.test_active_principal_accounts WHERE principal_subject='ambiguous-subject'");
    }
    assert.equal((await repository.findAuthorizedByCredentialHash(hash(deviceToken))).owner.principalId, "principal-rd");
  });

  await check("device authentication is owner-bound and account or role revocation denies the next request", async () => {
    const found = await repository.findAuthorizedByCredentialHash(hash(deviceToken));
    assert.equal(found.owner.principalId, "principal-rd");
    const own = await repository.list("company-jenfu", "principal-rd");
    assert.equal(own.every((row) => row.ownerPrincipalId === "principal-rd"), true);
    await admin.query("UPDATE ai_pdm_core.principal_accounts SET account_status='suspended' WHERE principal_id='principal-rd'");
    await expectCode(() => repository.findAuthorizedByCredentialHash(hash(deviceToken)), "principal_account_inactive");
    await admin.query("UPDATE ai_pdm_core.principal_accounts SET account_status='active' WHERE principal_id='principal-rd'");
    await admin.query("DELETE FROM orgmaster_contract.test_ai_pdm_principal_grants WHERE principal_id='principal-rd'");
    await expectCode(() => repository.findAuthorizedByCredentialHash(hash(deviceToken)), "permission_not_granted");
    await admin.query(`
      INSERT INTO orgmaster_contract.test_ai_pdm_principal_grants VALUES
        ('jenfu.orgmaster.ai-pdm-principal-grants.v4','version-current',1,'assignment-rd','direct',NULL,
         'ai-pdm','principal-rd','employee-rd','employee',NULL,'role-rd','rd',
         'ai-pdm.role-catalog.2026-09-03.v3','global',NULL,now()-interval '1 day',NULL,now()-interval '1 day')
    `);
  });

  await check("migration 090 prevents changing a device to another Principal owner", async () => {
    await assert.rejects(
      admin.query("UPDATE ai_pdm_core.windows_service_devices SET owner_principal_id='principal-b' WHERE id=$1", [deviceId]),
      (error) => error?.code === "23514"
    );
  });

  await check("database-clock heartbeat drives online state and revocation immediately denies the device", async () => {
    const heartbeat = await repository.heartbeat({ credentialHash: hash(deviceToken), deviceId,
      companyId: "company-jenfu", instanceId });
    assert.ok(heartbeat.lastSeenAt);
    const listed = await repository.list("company-jenfu");
    assert.equal(listed.find((row) => row.id === deviceId).connection, "online");
    const revoked = await repository.revoke({ companyId: "company-jenfu", deviceId,
      expectedRowVersion: active.rowVersion, actorPrincipalId: "principal-rd", canManageAll: false });
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.instanceId, null);
    await expectCode(() => repository.heartbeat({ credentialHash: hash(deviceToken), deviceId,
      companyId: "company-jenfu", instanceId }), "WORKER_DEVICE_UNAUTHORIZED");
    assert.equal(await repository.findAuthorizedByCredentialHash(hash(deviceToken)), null);
  });

  const plaintext = await admin.query(`
    SELECT count(*)::int AS count FROM information_schema.columns
    WHERE table_schema='ai_pdm_core' AND table_name IN ('windows_service_devices','windows_service_enrollments')
      AND column_name ~ '(token|plain|code)$'
  `);
  assert.equal(plaintext.rows[0].count, 0);
  process.stdout.write(`${JSON.stringify({ status: "PASS", checks: checks.length, taskRoot, productionWrites: false })}\n`);
} finally {
  if (runtime) await runtime.close().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  if (started) {
    try { run("pg_ctl.exe", ["-D", cluster, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); } catch { }
  }
  if (port) assert.equal(await portReleased(port), true);
  const resolvedTaskRoot = path.resolve(taskRoot);
  assert.ok(resolvedTaskRoot.startsWith(`${tempBase}${path.sep}aipdm-dev125-device-`));
  fs.rmSync(resolvedTaskRoot, { recursive: true, force: true });
  assert.equal(fs.existsSync(resolvedTaskRoot), false);
}
