#!/usr/bin/env node

import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.PDM_POSTGRES_URL?.trim() ?? "";
if (!/^postgres(?:ql)?:\/\/[^/]*127\.0\.0\.1(?::\d+)?\/postgres(?:\?|$)/u.test(connectionString)) {
  throw new Error("DEV121_REQUIRES_TASK_OWNED_LOCAL_POSTGRES");
}

process.env.PDM_DB_PROVIDER = "postgres";
process.env.PDM_JENFU_ENTITLEMENT_MODE = "enforce";
process.env.PDM_JENFU_PLATFORM_AUTH_MODE = "on";

const admin = new pg.Client({ connectionString, application_name: "ai-pdm-dev121-qc-admin" });
let runtimeDatabase;
let closeRuntimeDatabase;
const checks = [];

async function check(id, label, action) {
  const detail = await action();
  checks.push({ id, status: "PASS", label, detail });
  process.stdout.write(`PASS ${id} ${label}\n`);
}

async function waitForPrincipalRead() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await admin.query(`SELECT pid, query FROM pg_stat_activity
      WHERE application_name='ai-pdm-postgres-runtime' AND state='active'
        AND query ILIKE '%v_active_principal_mappings_v1%'`);
    if (result.rowCount === 1) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("DEV121_AUTHORIZATION_READ_DID_NOT_REACH_PRINCIPAL_VIEW");
}

async function main() {
  await admin.connect();
  await admin.query(`DO $$ BEGIN
    IF to_regnamespace('orgmaster_contract') IS NOT NULL
      OR to_regclass('public.role_priority_versions') IS NOT NULL
      OR to_regclass('public.role_permissions') IS NOT NULL THEN
      RAISE EXCEPTION 'DEV121_TEST_DATABASE_NOT_EMPTY';
    END IF;
  END $$`);
  await admin.query(`
    CREATE SCHEMA orgmaster_contract;
    CREATE TABLE orgmaster_contract.qc_dev121_principals (
      contract_version text NOT NULL, principal_issuer text NOT NULL, principal_subject text NOT NULL,
      principal_id text NOT NULL, employee_id text NOT NULL, employee_status text NOT NULL,
      mapping_version bigint NOT NULL, published_at timestamptz NOT NULL
    );
    CREATE FUNCTION orgmaster_contract.qc_dev121_delay(value timestamptz) RETURNS timestamptz
      LANGUAGE plpgsql VOLATILE AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN value; END $$;
    CREATE VIEW orgmaster_contract.v_active_principal_mappings_v1 AS
      SELECT contract_version, principal_issuer, principal_subject, principal_id, employee_id,
        employee_status, mapping_version, orgmaster_contract.qc_dev121_delay(published_at) AS published_at
      FROM orgmaster_contract.qc_dev121_principals;

    CREATE TABLE orgmaster_contract.qc_dev121_authority (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), contract_version text NOT NULL,
      application_id text NOT NULL, authority_source text NOT NULL, authority_version bigint NOT NULL,
      employee_id text, updated_at timestamptz NOT NULL, operation_id text
    );
    CREATE VIEW orgmaster_contract.v_ai_pdm_entitlement_authority_v1 AS
      SELECT contract_version, application_id, authority_source, authority_version, employee_id, updated_at, operation_id
      FROM orgmaster_contract.qc_dev121_authority;

    CREATE TABLE orgmaster_contract.qc_dev121_grants (
      contract_version text NOT NULL, assignment_version_id text NOT NULL, assignment_version bigint NOT NULL,
      assignment_id text NOT NULL, grant_kind text NOT NULL, delegation_id text, application_id text NOT NULL,
      identity_issuer text NOT NULL, identity_subject text NOT NULL, principal_id text NOT NULL, employee_id text NOT NULL,
      subject_kind text NOT NULL, target_principal_id text, stable_role_id text NOT NULL, role_code text NOT NULL,
      catalog_version text NOT NULL, scope_kind text NOT NULL, scope_key text, valid_from timestamptz NOT NULL,
      valid_until timestamptz, published_at timestamptz NOT NULL, authority_version bigint NOT NULL
    );
    CREATE VIEW orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 AS
      SELECT * FROM orgmaster_contract.qc_dev121_grants;

    CREATE TABLE public.role_priority_versions (status text NOT NULL, created_at timestamptz NOT NULL, priority_json text NOT NULL);
    CREATE TABLE public.roles (id text PRIMARY KEY, role_code text NOT NULL, title text NOT NULL DEFAULT '', system_defined integer NOT NULL DEFAULT 1, enabled integer NOT NULL DEFAULT 1);
    CREATE TABLE public.users (id text PRIMARY KEY, display_name text NOT NULL, email text, role text NOT NULL);
    CREATE TABLE public.role_permissions (id text PRIMARY KEY, role_id text NOT NULL, permission_kind text NOT NULL, permission_code text NOT NULL, allowed boolean NOT NULL);
    CREATE TABLE public.user_role_assignments (user_id text NOT NULL, role_id text NOT NULL, revoked_at timestamptz, starts_at timestamptz, hard_ends_at timestamptz, assigned_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.approval_delegations (delegated_from text NOT NULL, delegated_to text NOT NULL, project_code text, action_code text, revoked_at timestamptz, starts_at timestamptz, ends_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.role_priority_versions(status, created_at, priority_json)
      VALUES ('active', now(), '["system_admin","pdm_admin","rd_manager","qa","rd","manufacturing","procurement","external_specialist"]');
    INSERT INTO public.roles(id, role_code, title) VALUES ('role-rd','rd','Research and development');
    INSERT INTO public.users(id, display_name, email, role) VALUES
      ('local-user-dev121','DEV-121 synthetic actor',NULL,'Engineer');

    INSERT INTO orgmaster_contract.qc_dev121_principals VALUES
      ('organization.active-principal.v1','issuer-dev121','subject-dev121','principal-dev121','employee-dev121','active',1,now());
    INSERT INTO orgmaster_contract.qc_dev121_authority VALUES
      (true,'jenfu.platform-entitlement.v1','ai-pdm','orgmaster_authority',2,'employee-dev121',now(),'before-switch');
    INSERT INTO orgmaster_contract.qc_dev121_grants VALUES
      ('jenfu.platform-entitlement.v1','assignment-version-2',2,'assignment-dev121','direct',NULL,'ai-pdm',
        'issuer-dev121','subject-dev121','principal-dev121','employee-dev121','employee',NULL,'role-rd','rd',
        'ai-pdm.role-catalog.2026-09-03.v3','workspace','current',now()-interval '1 day',NULL,now()-interval '1 day',2);
  `);

  const [{ checkNumberingPermissionsAsync }, { getAsyncDatabaseClient, closeAsyncDatabaseClient }] = await Promise.all([
    import("../src/lib/numbering-permission-async.ts"),
    import("../src/lib/db-async-provider.ts"),
  ]);
  runtimeDatabase = getAsyncDatabaseClient();
  closeRuntimeDatabase = closeAsyncDatabaseClient;

  await check("D121-PG-01", "enforced authorization opens a read-only repeatable-read transaction", async () => {
    const result = await runtimeDatabase.transaction(async (transaction) => transaction.query(`
      SELECT current_setting('transaction_isolation') AS isolation,
             current_setting('transaction_read_only') AS read_only`), { isolationLevel: "repeatable_read", readOnly: true });
    assert.deepEqual(result, [{ isolation: "repeatable read", read_only: "on" }]);
    return result[0];
  });

  const actor = {
    identityIssuer: "issuer-dev121", identitySubject: "subject-dev121", principalId: "principal-dev121",
    employeeId: "employee-dev121", localPrincipalId: "local-user-dev121", companyId: "company-jenfu",
  };
  const input = {
    user: { id: actor.localPrincipalId, role: "Engineer", company_id: actor.companyId, authorizationActor: actor },
    permissionKind: "action", permissionCode: "submission.create", workspaceCode: "company-jenfu", projectCode: null,
  };

  await check("D121-PG-02", "concurrent authority and grant switch cannot mix a request snapshot", async () => {
    const request = checkNumberingPermissionsAsync([input]);
    const activeRead = await waitForPrincipalRead();
    await admin.query("BEGIN");
    try {
      await admin.query(`UPDATE orgmaster_contract.qc_dev121_authority
        SET authority_source='legacy_authority', authority_version=3, updated_at=now(), operation_id='after-snapshot'
        WHERE singleton=true`);
      await admin.query("DELETE FROM orgmaster_contract.qc_dev121_grants WHERE employee_id='employee-dev121'");
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    const [inFlight] = await request;
    assert.equal(inFlight.allowed, true, "the in-flight request must consistently use its already-open OrgMaster snapshot");
    assert.equal(inFlight.decisionCode, "allowed");

    const [afterCommit] = await checkNumberingPermissionsAsync([input]);
    assert.equal(afterCommit.allowed, false, "a request started after the authority commit must not reuse the old grant");
    assert.equal(afterCommit.decisionCode, "permission_not_granted");
    return { switchCommittedWhilePrincipalReadWasActive: true, inFlight: inFlight.decisionCode, nextRequest: afterCommit.decisionCode, observedBackendPid: activeRead.pid };
  });
}

try {
  await main();
  process.stdout.write(`${JSON.stringify({ runner: "DEV-121 isolated PostgreSQL authorization snapshot", status: "PASS", productionWrites: false, executedCaseCount: checks.length, checks })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ runner: "DEV-121 isolated PostgreSQL authorization snapshot", status: "FAIL", productionWrites: false, checks, error: error instanceof Error ? error.stack ?? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  if (closeRuntimeDatabase) await closeRuntimeDatabase().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
}
