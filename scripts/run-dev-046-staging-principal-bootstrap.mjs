#!/usr/bin/env node

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import pg from "pg";
import { buildDev046StagingPrincipalBootstrapPackage } from "./dev-046-staging-principal-bootstrap-package.mjs";

export const DEV046_STAGING_PRINCIPAL_BOOTSTRAP_RUNNER_VERSION =
  "dev-046-staging-principal-bootstrap-runner/v1";
export const DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL =
  "DEV-046-STAGING-PRINCIPAL-BOOTSTRAP-APPROVED";

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function unwrapTransaction(sql) {
  const beginMarker = "\nBEGIN;\n";
  const commitMarker = "\nCOMMIT;\n";
  const beginIndex = sql.indexOf(beginMarker);
  const commitIndex = sql.lastIndexOf(commitMarker);
  if (beginIndex < 0 || commitIndex < 0 || commitIndex <= beginIndex) {
    throw new Error("PRINCIPAL_BOOTSTRAP_TRANSACTION_WRAPPER_INVALID");
  }
  if (sql.slice(commitIndex + commitMarker.length).trim() !== "") {
    throw new Error("PRINCIPAL_BOOTSTRAP_TRAILING_SQL_FORBIDDEN");
  }
  return sql.slice(beginIndex + beginMarker.length, commitIndex);
}

export function buildDev046StagingPrincipalBootstrapRunPlan() {
  const packageData = buildDev046StagingPrincipalBootstrapPackage();
  const { report, manifest, bootstrapSql, readbackSql } = packageData;
  if (report.status !== "proposal_only_not_approved_for_live_apply") {
    throw new Error("PRINCIPAL_BOOTSTRAP_PACKAGE_STATUS_INVALID");
  }
  if (report.target.environment !== "staging" || report.target.projectId !== "jenfu-ai-pdm-stg-361825") {
    throw new Error("PRINCIPAL_BOOTSTRAP_TARGET_NOT_STAGING");
  }
  const bootstrapArtifact = manifest.artifacts.find((artifact) => artifact.path === "bootstrap.sql");
  const readbackArtifact = manifest.artifacts.find((artifact) => artifact.path === "readback.sql");
  if (bootstrapArtifact?.sha256 !== sha256(bootstrapSql)) {
    throw new Error("PRINCIPAL_BOOTSTRAP_SQL_HASH_MISMATCH");
  }
  if (readbackArtifact?.sha256 !== sha256(readbackSql)) {
    throw new Error("PRINCIPAL_BOOTSTRAP_READBACK_HASH_MISMATCH");
  }
  return {
    runnerVersion: DEV046_STAGING_PRINCIPAL_BOOTSTRAP_RUNNER_VERSION,
    target: report.target,
    principal: report.principal,
    canonicalMatrix: report.canonicalMatrix,
    bootstrapSha256: bootstrapArtifact.sha256,
    readbackSha256: readbackArtifact.sha256,
    bootstrapSql: unwrapTransaction(bootstrapSql),
    readbackSql
  };
}

export function assertDev046StagingPrincipalBootstrapEnvironment(plan, env = process.env) {
  if (env.DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL !== DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL_MISSING");
  }
  if (env.DEV046_STAGING_PROJECT_ID !== plan.target.projectId) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_PROJECT_MISMATCH");
  }
  if (env.DEV046_STAGING_REGION !== plan.target.region) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_REGION_MISMATCH");
  }
  if (env.CLOUD_RUN_JOB !== "ai-pdm-stg-migration-runner") {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_JOB_MISMATCH");
  }
  if (env.PDM_DB_PROVIDER !== "cloud_sql_postgres") {
    throw new Error("PDM_DB_PROVIDER_MUST_BE_CLOUD_SQL_POSTGRES");
  }
  if (env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME !== plan.target.connectionName) {
    throw new Error("PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME_MISMATCH");
  }
  if ((env.PDM_CLOUD_SQL_HOST ?? "127.0.0.1") !== "127.0.0.1") {
    throw new Error("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED");
  }
  if ((env.PDM_CLOUD_SQL_DATABASE ?? "") !== plan.target.databaseName) {
    throw new Error("PDM_CLOUD_SQL_DATABASE_MISMATCH");
  }
  if ((env.PDM_CLOUD_SQL_USER ?? "") !== plan.target.migrationIamDatabaseUser) {
    throw new Error("PDM_CLOUD_SQL_USER_MUST_BE_MIGRATION_IAM_USER");
  }
  if (!env.PDM_SOURCE_REVISION || env.DEV046_EXPECTED_SOURCE_REVISION !== env.PDM_SOURCE_REVISION) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_SOURCE_REVISION_MISMATCH");
  }
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim()) {
    throw new Error("STATIC_DATABASE_SECRET_FORBIDDEN");
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error("SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
  }
}

function connectionConfigFromEnv(plan, env) {
  return {
    host: "127.0.0.1",
    port: Number.parseInt(env.PDM_CLOUD_SQL_PORT || "5432", 10),
    database: plan.target.databaseName,
    user: plan.target.migrationIamDatabaseUser,
    password: undefined,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: Number.parseInt(env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS || "60000", 10),
    idleTimeoutMillis: Number.parseInt(env.PDM_CLOUD_SQL_IDLE_TIMEOUT_MS || "600000", 10),
    statement_timeout: Number.parseInt(env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS || "30000", 10),
    query_timeout: Number.parseInt(env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS || "35000", 10),
    application_name: "ai-pdm-dev-046-principal-bootstrap"
  };
}

function rowsFromQueryResult(result) {
  const results = Array.isArray(result) ? result : [result];
  return results.findLast((item) => Array.isArray(item?.rows) && item.rows.length > 0)?.rows ?? [];
}

export function assertDev046StagingPrincipalBootstrapReadback(plan, row) {
  const booleanColumns = [
    "user_id_ok",
    "email_ok",
    "no_application_password",
    "admin_active",
    "firebase_mapping_ok",
    "default_membership_ok",
    "organization_mapping_ok",
    "canonical_roles_ok",
    "canonical_permissions_ok"
  ];
  if (!row || booleanColumns.some((column) => row[column] !== true)) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_READBACK_BOOLEAN_MISMATCH");
  }
  if (
    row.canonical_role_count !== plan.canonicalMatrix.roleCount ||
    row.expected_role_count !== plan.canonicalMatrix.roleCount ||
    row.canonical_permission_count !== plan.canonicalMatrix.permissionCount ||
    row.expected_permission_count !== plan.canonicalMatrix.permissionCount
  ) {
    throw new Error("STAGING_PRINCIPAL_BOOTSTRAP_READBACK_COUNT_MISMATCH");
  }
  return {
    principalId: plan.principal.pdmUserId,
    firebaseUid: plan.principal.firebaseUid,
    roleCount: row.canonical_role_count,
    permissionCount: row.canonical_permission_count,
    allChecksPassed: true
  };
}

async function executeBootstrap(plan, env) {
  const pool = new pg.Pool(connectionConfigFromEnv(plan, env));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(plan.bootstrapSql);
    const readbackResult = await client.query(plan.readbackSql);
    const summary = assertDev046StagingPrincipalBootstrapReadback(plan, rowsFromQueryResult(readbackResult)[0]);
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function summarizePlan(plan, mode) {
  return {
    runnerVersion: plan.runnerVersion,
    mode,
    target: plan.target,
    principal: {
      pdmUserId: plan.principal.pdmUserId,
      email: plan.principal.email,
      firebaseUid: plan.principal.firebaseUid
    },
    canonicalRoleCount: plan.canonicalMatrix.roleCount,
    canonicalPermissionCount: plan.canonicalMatrix.permissionCount,
    bootstrapSha256: plan.bootstrapSha256,
    readbackSha256: plan.readbackSha256,
    connectionAttempted: mode === "execute",
    explicitApprovalRequired: DEV046_STAGING_PRINCIPAL_BOOTSTRAP_APPROVAL
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const execute = process.argv.slice(2).includes("--execute");
  try {
    const plan = buildDev046StagingPrincipalBootstrapRunPlan();
    if (!execute) {
      console.log(JSON.stringify(summarizePlan(plan, "dry_run"), null, 2));
    } else {
      assertDev046StagingPrincipalBootstrapEnvironment(plan);
      const result = await executeBootstrap(plan, process.env);
      console.log(JSON.stringify({ ...summarizePlan(plan, "execute"), readback: result }, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
