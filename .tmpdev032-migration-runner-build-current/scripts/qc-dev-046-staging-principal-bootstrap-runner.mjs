#!/usr/bin/env node

import {
  DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL,
  assertDev046StagingPrincipalBootstrapEnvironment,
  assertDev046StagingPrincipalBootstrapReadback,
  buildDev046StagingPrincipalBootstrapRunPlan
} from "./run-dev-046-staging-principal-bootstrap.mjs";

const results = [];

function record(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}

function rejects(fn, expected) {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === expected;
  }
}

const plan = buildDev046StagingPrincipalBootstrapRunPlan();
const approvedEnv = {
  DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL,
  DEV046_STAGING_PROJECT_ID: plan.target.projectId,
  DEV046_STAGING_REGION: plan.target.region,
  DEV046_EXPECTED_SOURCE_REVISION: "qc-source-revision",
  CLOUD_RUN_JOB: "ai-pdm-stg-migration-runner",
  PDM_DB_PROVIDER: "cloud_sql_postgres",
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: plan.target.connectionName,
  PDM_CLOUD_SQL_HOST: "127.0.0.1",
  PDM_CLOUD_SQL_DATABASE: plan.target.databaseName,
  PDM_CLOUD_SQL_USER: plan.target.migrationIamDatabaseUser,
  PDM_SOURCE_REVISION: "qc-source-revision"
};

record(
  "DEV046-PRINCIPAL-RUNNER-001 plan is pinned to staging and exact identity",
  plan.target.environment === "staging" &&
    plan.target.projectId === "jenfu-ai-pdm-stg-361825" &&
    plan.principal.firebaseUid === "qxEv2napjvMEmiqIUqwhTCf6gjg2"
);
record(
  "DEV046-PRINCIPAL-RUNNER-002 generated package hashes are retained",
  /^[a-f0-9]{64}$/u.test(plan.bootstrapSha256) && /^[a-f0-9]{64}$/u.test(plan.readbackSha256)
);
record(
  "DEV046-PRINCIPAL-RUNNER-003 inner transaction keeps singleton lock and no commit",
  plan.bootstrapSql.includes("pg_advisory_xact_lock(7104604602)") &&
    !/(?:^|\n)COMMIT;/u.test(plan.bootstrapSql)
);
assertDev046StagingPrincipalBootstrapEnvironment(plan, approvedEnv);
record("DEV046-PRINCIPAL-RUNNER-004 exact approved staging environment passes", true);
record(
  "DEV046-PRINCIPAL-RUNNER-005 approval is fail closed",
  rejects(
    () => assertDev046StagingPrincipalBootstrapEnvironment(plan, { ...approvedEnv, DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL: "" }),
    "STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL_MISSING"
  )
);
record(
  "DEV046-PRINCIPAL-RUNNER-006 source revision mismatch is fail closed",
  rejects(
    () => assertDev046StagingPrincipalBootstrapEnvironment(plan, { ...approvedEnv, DEV046_EXPECTED_SOURCE_REVISION: "other" }),
    "STAGING_PRINCIPAL_BOOTSTRAP_SOURCE_REVISION_MISMATCH"
  )
);
record(
  "DEV046-PRINCIPAL-RUNNER-007 production or alternate target is rejected",
  rejects(
    () => assertDev046StagingPrincipalBootstrapEnvironment(plan, { ...approvedEnv, DEV046_STAGING_PROJECT_ID: "jenfu-ai-pdm-prod" }),
    "STAGING_PRINCIPAL_BOOTSTRAP_PROJECT_MISMATCH"
  )
);
record(
  "DEV046-PRINCIPAL-RUNNER-008 static database credentials are rejected",
  rejects(
    () => assertDev046StagingPrincipalBootstrapEnvironment(plan, { ...approvedEnv, PDM_CLOUD_SQL_PASSWORD: "forbidden" }),
    "STATIC_DATABASE_SECRET_FORBIDDEN"
  )
);
const passingReadback = {
  user_id_ok: true,
  email_ok: true,
  no_application_password: true,
  admin_active: true,
  firebase_mapping_ok: true,
  default_membership_ok: true,
  organization_mapping_ok: true,
  canonical_role_count: plan.canonicalMatrix.roleCount,
  expected_role_count: plan.canonicalMatrix.roleCount,
  canonical_permission_count: plan.canonicalMatrix.permissionCount,
  expected_permission_count: plan.canonicalMatrix.permissionCount,
  canonical_roles_ok: true,
  canonical_permissions_ok: true
};
record(
  "DEV046-PRINCIPAL-RUNNER-009 complete readback passes",
  assertDev046StagingPrincipalBootstrapReadback(plan, passingReadback).allChecksPassed
);
record(
  "DEV046-PRINCIPAL-RUNNER-010 incomplete readback is fail closed",
  rejects(
    () => assertDev046StagingPrincipalBootstrapReadback(plan, { ...passingReadback, admin_active: false }),
    "STAGING_PRINCIPAL_BOOTSTRAP_READBACK_BOOLEAN_MISMATCH"
  )
);

console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
