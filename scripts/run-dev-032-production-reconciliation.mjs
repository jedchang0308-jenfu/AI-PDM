#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { buildDev032ProductionReconciliationPackage } from "./dev-032-production-reconciliation-package.mjs";

export const DEV032_PRODUCTION_RECONCILIATION_RUNNER_VERSION =
  "dev-032-production-reconciliation-runner/v1";
export const DEV032_PRODUCTION_RECONCILIATION_APPROVAL =
  "DEV-032-PRODUCTION-RECONCILIATION-READONLY-APPROVED";

const sourceConnectionName = "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres";
const restoreConnectionPattern = /^jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-[a-z0-9-]{6,40}$/u;
const allowedModes = new Set(["pre_canary", "post_smoke", "restore"]);

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export function buildDev032ProductionReconciliationRunPlan() {
  const packageData = buildDev032ProductionReconciliationPackage();
  if (packageData.manifest.readbackSqlSha256 !== sha256(packageData.readbackSql)) {
    throw new Error("PRODUCTION_RECONCILIATION_SQL_HASH_MISMATCH");
  }
  return {
    runnerVersion: DEV032_PRODUCTION_RECONCILIATION_RUNNER_VERSION,
    target: packageData.report.target,
    expectedMigrationCount: packageData.report.expectedMigrationCount,
    expectedRoleCount: packageData.report.expectedRoleCount,
    expectedPermissionCount: packageData.report.expectedPermissionCount,
    readbackSqlSha256: packageData.manifest.readbackSqlSha256,
    readbackSql: packageData.readbackSql
  };
}

export function assertDev032ProductionReconciliationEnvironment(plan, env = process.env) {
  const mode = env.DEV032_RECONCILIATION_MODE ?? "";
  const connectionName = env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME ?? "";
  if (env.DEV032_PRODUCTION_RECONCILIATION_APPROVAL !== DEV032_PRODUCTION_RECONCILIATION_APPROVAL) {
    throw new Error("PRODUCTION_RECONCILIATION_APPROVAL_MISSING");
  }
  if (!allowedModes.has(mode)) throw new Error("PRODUCTION_RECONCILIATION_MODE_INVALID");
  if (mode === "restore" ? !restoreConnectionPattern.test(connectionName) : connectionName !== sourceConnectionName) {
    throw new Error("PRODUCTION_RECONCILIATION_CONNECTION_TARGET_MISMATCH");
  }
  if (env.DEV032_PRODUCTION_PROJECT_ID !== plan.target.projectId || env.DEV032_PRODUCTION_REGION !== plan.target.region) {
    throw new Error("PRODUCTION_RECONCILIATION_TARGET_ENV_MISMATCH");
  }
  if (env.CLOUD_RUN_JOB !== "ai-pdm-prod-migration-runner") throw new Error("PRODUCTION_RECONCILIATION_JOB_MISMATCH");
  if (env.PDM_DB_PROVIDER !== "cloud_sql_postgres") throw new Error("PDM_DB_PROVIDER_MUST_BE_CLOUD_SQL_POSTGRES");
  if ((env.PDM_CLOUD_SQL_HOST ?? "127.0.0.1") !== "127.0.0.1") throw new Error("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED");
  if ((env.PDM_CLOUD_SQL_DATABASE ?? "") !== plan.target.databaseName) throw new Error("PDM_CLOUD_SQL_DATABASE_MISMATCH");
  if ((env.PDM_CLOUD_SQL_USER ?? "") !== plan.target.migrationIamDatabaseUser) {
    throw new Error("PDM_CLOUD_SQL_USER_MUST_BE_MIGRATION_IAM_USER");
  }
  if (!env.PDM_SOURCE_REVISION || env.DEV032_EXPECTED_SOURCE_REVISION !== env.PDM_SOURCE_REVISION) {
    throw new Error("PRODUCTION_RECONCILIATION_SOURCE_REVISION_MISMATCH");
  }
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim()) {
    throw new Error("STATIC_DATABASE_SECRET_FORBIDDEN");
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) throw new Error("SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
  return { mode, connectionName };
}

function asNumber(row, column) {
  const value = Number(row?.[column]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`PRODUCTION_RECONCILIATION_INVALID_COUNT:${column}`);
  return value;
}

export function assertDev032ProductionReconciliationReadback(plan, mode, row) {
  if (!row) throw new Error("PRODUCTION_RECONCILIATION_ROW_MISSING");
  const zeroColumns = [
    "missing_migration_count",
    "extra_migration_count",
    "checksum_mismatch_count",
    "duplicate_root_count",
    "duplicate_part_count",
    "duplicate_drawing_count",
    "active_number_reuse_count",
    "duplicate_active_candidate_count",
    "sequence_regression_count",
    "orphan_candidate_count",
    "orphan_promoted_target_count",
    "stale_processing_receipt_count",
    "gcs_evidence_count"
  ];
  for (const column of zeroColumns) {
    if (asNumber(row, column) !== 0) throw new Error(`PRODUCTION_RECONCILIATION_NONZERO:${column}`);
  }
  if (asNumber(row, "expected_migration_count") !== plan.expectedMigrationCount || asNumber(row, "actual_migration_count") !== plan.expectedMigrationCount) {
    throw new Error("PRODUCTION_RECONCILIATION_MIGRATION_COUNT_MISMATCH");
  }
  if (asNumber(row, "company_count") !== 1 || asNumber(row, "active_admin_count") !== 1) {
    throw new Error("PRODUCTION_RECONCILIATION_IDENTITY_SEED_MISMATCH");
  }
  if (asNumber(row, "role_count") !== plan.expectedRoleCount || asNumber(row, "canonical_permission_count") !== plan.expectedPermissionCount) {
    throw new Error("PRODUCTION_RECONCILIATION_PERMISSION_SEED_MISMATCH");
  }
  if (mode === "pre_canary") {
    for (const column of ["root_count", "part_count", "drawing_count", "legacy_draft_count", "workspace_count"]) {
      if (asNumber(row, column) !== 0) throw new Error(`PRODUCTION_RECONCILIATION_PRECANARY_NOT_CLEAN:${column}`);
    }
  }
  const snapshot = row.numbering_snapshot ?? {};
  return {
    mode,
    allChecksPassed: true,
    migrationCount: plan.expectedMigrationCount,
    roleCount: plan.expectedRoleCount,
    canonicalPermissionCount: plan.expectedPermissionCount,
    permissionCount: asNumber(row, "permission_count"),
    counts: {
      roots: asNumber(row, "root_count"),
      parts: asNumber(row, "part_count"),
      drawings: asNumber(row, "drawing_count"),
      legacyDrafts: asNumber(row, "legacy_draft_count"),
      workspaces: asNumber(row, "workspace_count")
    },
    numberingSnapshotSha256: sha256(JSON.stringify(snapshot))
  };
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
    application_name: "ai-pdm-dev-032-production-reconciliation"
  };
}

async function executeReadback(plan, mode, env) {
  const pool = new pg.Pool(connectionConfigFromEnv(plan, env));
  try {
    const result = await pool.query(plan.readbackSql);
    return assertDev032ProductionReconciliationReadback(plan, mode, result.rows?.[0]);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const execute = process.argv.slice(2).includes("--execute");
  try {
    const plan = buildDev032ProductionReconciliationRunPlan();
    if (!execute) {
      console.log(JSON.stringify({
        runnerVersion: plan.runnerVersion,
        mode: "dry_run",
        expectedMigrationCount: plan.expectedMigrationCount,
        expectedRoleCount: plan.expectedRoleCount,
        expectedPermissionCount: plan.expectedPermissionCount,
        readbackSqlSha256: plan.readbackSqlSha256,
        connectionAttempted: false,
        explicitApprovalRequired: DEV032_PRODUCTION_RECONCILIATION_APPROVAL
      }, null, 2));
    } else {
      const environment = assertDev032ProductionReconciliationEnvironment(plan);
      const readback = await executeReadback(plan, environment.mode, process.env);
      console.log(JSON.stringify({ runnerVersion: plan.runnerVersion, mode: environment.mode, connectionAttempted: true, readback }, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
