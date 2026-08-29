#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const PRODUCTION_AUTHORITY_REPAIR_VERSION = "ai-pdm-production-authority-repair/v1";
export const PRODUCTION_AUTHORITY_REPAIR_APPROVAL = "AI-PDM-PRODUCTION-AUTHORITY-REPAIR-APPROVED";
export const PRODUCTION_AUTHORITY_TARGET = Object.freeze({
  project: "jenfu-ai-pdm-prod",
  region: "asia-east1",
  job: "ai-pdm-prod-migration-runner",
  connectionName: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres",
  database: "ai_pdm",
  databaseUser: "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam",
  mode: "canonical_only",
  schemaHash: "dev090-v1"
});

const shaPattern = /^[a-f0-9]{40}$/u;
const emptyCommitSentinel = "__EMPTY__";

export function normalizeExpectedCommit(value) {
  if (value === emptyCommitSentinel) return "";
  if (!shaPattern.test(value ?? "")) throw new Error("PRODUCTION_AUTHORITY_EXPECTED_COMMIT_INVALID");
  return value;
}

export function assertAuthorityRepairEnvironment(env = process.env) {
  if (env.PDM_PRODUCTION_AUTHORITY_REPAIR_APPROVAL !== PRODUCTION_AUTHORITY_REPAIR_APPROVAL) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_APPROVAL_MISSING");
  }
  if (
    env.PDM_PRODUCTION_PROJECT_ID !== PRODUCTION_AUTHORITY_TARGET.project ||
    env.PDM_PRODUCTION_REGION !== PRODUCTION_AUTHORITY_TARGET.region ||
    env.CLOUD_RUN_JOB !== PRODUCTION_AUTHORITY_TARGET.job
  ) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_TARGET_MISMATCH");
  }
  if (
    env.PDM_DB_PROVIDER !== "cloud_sql_postgres" ||
    env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME !== PRODUCTION_AUTHORITY_TARGET.connectionName ||
    (env.PDM_CLOUD_SQL_HOST ?? "127.0.0.1") !== "127.0.0.1" ||
    env.PDM_CLOUD_SQL_DATABASE !== PRODUCTION_AUTHORITY_TARGET.database ||
    env.PDM_CLOUD_SQL_USER !== PRODUCTION_AUTHORITY_TARGET.databaseUser
  ) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_DATABASE_TARGET_MISMATCH");
  }
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim()) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_STATIC_DATABASE_SECRET_FORBIDDEN");
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_SERVICE_ACCOUNT_KEY_FORBIDDEN");
  }

  const sourceRevision = env.PDM_SOURCE_REVISION?.trim() ?? "";
  const newCommit = env.PDM_AUTHORITY_NEW_COMMIT?.trim() ?? "";
  if (!shaPattern.test(sourceRevision) || newCommit !== sourceRevision) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_SOURCE_REVISION_MISMATCH");
  }
  const expectedRowVersion = Number.parseInt(env.PDM_AUTHORITY_EXPECTED_ROW_VERSION ?? "", 10);
  if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_ROW_VERSION_INVALID");
  }
  return {
    sourceRevision,
    newCommit,
    expectedCommit: normalizeExpectedCommit(env.PDM_AUTHORITY_EXPECTED_CURRENT_COMMIT),
    expectedRowVersion
  };
}

export function authorityProjection(row) {
  if (!row) throw new Error("PRODUCTION_AUTHORITY_REPAIR_ROW_MISSING");
  return {
    id: Number(row.id),
    mode: String(row.mode),
    expectedCommit: String(row.expected_commit ?? ""),
    schemaHash: String(row.schema_hash),
    rowVersion: Number(row.row_version),
    switchedAt: row.switched_at instanceof Date ? row.switched_at.toISOString() : String(row.switched_at)
  };
}

export function assertAuthorityProjection(row, expected) {
  const projection = authorityProjection(row);
  if (
    projection.id !== 1 ||
    projection.mode !== PRODUCTION_AUTHORITY_TARGET.mode ||
    projection.schemaHash !== PRODUCTION_AUTHORITY_TARGET.schemaHash ||
    projection.expectedCommit !== expected.expectedCommit ||
    projection.rowVersion !== expected.expectedRowVersion
  ) {
    throw new Error("PRODUCTION_AUTHORITY_REPAIR_COMPARE_AND_SWAP_MISMATCH");
  }
  return projection;
}

export async function repairAuthorityControlWithClient(client, repair) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const currentResult = await client.query(
      `SELECT id, mode, expected_commit, schema_hash, row_version, switched_at
         FROM pdm_workbench_state_authority_control
        WHERE id = 1
        FOR UPDATE`
    );
    const before = assertAuthorityProjection(currentResult.rows?.[0], repair);
    const updateResult = await client.query(
      `UPDATE pdm_workbench_state_authority_control
          SET expected_commit = $1,
              row_version = row_version + 1,
              switched_at = now()
        WHERE id = 1
          AND mode = $2
          AND schema_hash = $3
          AND expected_commit = $4
          AND row_version = $5
      RETURNING id, mode, expected_commit, schema_hash, row_version, switched_at`,
      [
        repair.newCommit,
        PRODUCTION_AUTHORITY_TARGET.mode,
        PRODUCTION_AUTHORITY_TARGET.schemaHash,
        repair.expectedCommit,
        repair.expectedRowVersion
      ]
    );
    if (updateResult.rowCount !== 1) throw new Error("PRODUCTION_AUTHORITY_REPAIR_COMPARE_AND_SWAP_UPDATE_FAILED");
    const after = authorityProjection(updateResult.rows?.[0]);
    if (
      after.expectedCommit !== repair.newCommit ||
      after.rowVersion !== repair.expectedRowVersion + 1 ||
      after.mode !== PRODUCTION_AUTHORITY_TARGET.mode ||
      after.schemaHash !== PRODUCTION_AUTHORITY_TARGET.schemaHash
    ) {
      throw new Error("PRODUCTION_AUTHORITY_REPAIR_READBACK_MISMATCH");
    }
    await client.query("COMMIT");
    return { before, after };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function connectionConfigFromEnv(env) {
  return {
    host: "127.0.0.1",
    port: Number.parseInt(env.PDM_CLOUD_SQL_PORT || "5432", 10),
    database: PRODUCTION_AUTHORITY_TARGET.database,
    user: PRODUCTION_AUTHORITY_TARGET.databaseUser,
    password: undefined,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: Number.parseInt(env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS || "60000", 10),
    idleTimeoutMillis: Number.parseInt(env.PDM_CLOUD_SQL_IDLE_TIMEOUT_MS || "600000", 10),
    statement_timeout: Number.parseInt(env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS || "30000", 10),
    query_timeout: Number.parseInt(env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS || "35000", 10),
    application_name: "ai-pdm-production-authority-repair"
  };
}

async function execute(env) {
  const repair = assertAuthorityRepairEnvironment(env);
  const pool = new pg.Pool(connectionConfigFromEnv(env));
  const client = await pool.connect();
  try {
    const result = await repairAuthorityControlWithClient(client, repair);
    return {
      schemaVersion: PRODUCTION_AUTHORITY_REPAIR_VERSION,
      mode: "execute",
      target: PRODUCTION_AUTHORITY_TARGET,
      sourceRevision: repair.sourceRevision,
      connectionAttempted: true,
      compareAndSwapApplied: true,
      before: result.before,
      after: result.after,
      allChecksPassed: true
    };
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const executeRequested = process.argv.slice(2).includes("--execute");
  try {
    if (!executeRequested) {
      console.log(JSON.stringify({
        schemaVersion: PRODUCTION_AUTHORITY_REPAIR_VERSION,
        mode: "dry_run",
        target: PRODUCTION_AUTHORITY_TARGET,
        connectionAttempted: false,
        productionMutationPerformed: false,
        explicitApprovalRequired: PRODUCTION_AUTHORITY_REPAIR_APPROVAL
      }, null, 2));
    } else {
      console.log(JSON.stringify(await execute(process.env), null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
