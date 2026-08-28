#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const DEV046_CLOUDSQL_MIGRATION_RUNNER_VERSION = "dev-046-cloudsql-migration-runner/v1";
export const DEV046_CLOUDSQL_MIGRATION_APPROVAL = "DEV-046-STAGING-CLOUDSQL-MIGRATION-APPROVED";
export const PDM_MIGRATION_ADVISORY_LOCK_ID = 7_104_604_601;

const root = process.cwd();
const defaultManifestPath = "output/dev-046-cloudsql-migration-package/cloudsql-migration-manifest.json";
const productionManifestPath = "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json";
const DEV032_CLOUDSQL_MIGRATION_APPROVAL = "DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED";
const DEV032_ISOLATED_RESTORE_TARGET_PATTERN =
  /^jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-[a-z0-9-]{6,40}$/u;

function projectPath(relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function assertSafeMigrationSql(sql, outputPath) {
  if (/\b(?:anon|authenticated|service_role)\b/iu.test(sql)) throw new Error(`MIGRATION_SQL_SUPABASE_ROLE_REFERENCE_FORBIDDEN:${outputPath}`);
  if (/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/iu.test(sql)) throw new Error(`MIGRATION_SQL_FORCED_RLS_FORBIDDEN:${outputPath}`);
  if (/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu.test(sql)) throw new Error(`MIGRATION_SQL_TRANSACTION_WRAPPER_FORBIDDEN:${outputPath}`);
  if (/\bCREATE\s+INDEX\s+CONCURRENTLY\b/iu.test(sql)) throw new Error(`MIGRATION_SQL_NON_TRANSACTIONAL_DDL_FORBIDDEN:${outputPath}`);
}

export function buildDev046CloudSqlMigrationRunPlan(manifestPath = defaultManifestPath) {
  const manifest = readJson(manifestPath);
  if (manifest.status !== "proposal_only_not_approved_for_live_apply") throw new Error("MIGRATION_MANIFEST_STATUS_NOT_PROPOSAL_ONLY");
  if (manifest.executionBoundary?.liveApplyAllowed === true) throw new Error("MIGRATION_MANIFEST_UNEXPECTEDLY_ALLOWS_LIVE_APPLY");
  if (manifest.executionBoundary?.requiresVpcAttachedRunner !== true) throw new Error("MIGRATION_MANIFEST_VPC_RUNNER_REQUIREMENT_MISSING");
  if (manifest.executionBoundary?.requiresReviewedAdminBootstrap !== true) throw new Error("MIGRATION_MANIFEST_ADMIN_BOOTSTRAP_REQUIREMENT_MISSING");

  const manifestDirectory = path.dirname(manifestPath).replaceAll("\\", "/");
  const schemaMigrations = manifest.orderedSchemaMigrations.map((migration) => {
    const sqlPath = `${manifestDirectory}/${migration.output}`;
    const sql = read(sqlPath);
    assertSafeMigrationSql(sql, migration.output);
    const outputSha256 = sha256(sql);
    if (outputSha256 !== migration.outputSha256) throw new Error(`MIGRATION_SQL_OUTPUT_HASH_MISMATCH:${migration.output}`);
    return { ...migration, sqlPath, sql };
  });
  const supportFiles = manifest.supportFiles.map((file) => {
    const sqlPath = `${manifestDirectory}/${file.output}`;
    const sql = read(sqlPath);
    const outputSha256 = sha256(sql);
    if (outputSha256 !== file.outputSha256) throw new Error(`MIGRATION_SUPPORT_SQL_OUTPUT_HASH_MISMATCH:${file.output}`);
    return { ...file, sqlPath, sql };
  });
  const adminBootstrap = supportFiles.find((file) => file.kind === "admin_bootstrap");
  const runtimeGrantRefresh = supportFiles.find((file) => file.kind === "runtime_grant_refresh");
  if (!adminBootstrap) throw new Error("MIGRATION_ADMIN_BOOTSTRAP_FILE_MISSING");
  if (!runtimeGrantRefresh) throw new Error("MIGRATION_RUNTIME_GRANT_REFRESH_FILE_MISSING");

  return {
    runnerVersion: DEV046_CLOUDSQL_MIGRATION_RUNNER_VERSION,
    manifestPath,
    manifestSha256: sha256(JSON.stringify(manifest, null, 2)),
    target: manifest.target,
    schemaMigrationCount: schemaMigrations.length,
    supportFileCount: supportFiles.length,
    schemaMigrations,
    adminBootstrap: { output: adminBootstrap.output, sqlPath: adminBootstrap.sqlPath, outputSha256: adminBootstrap.outputSha256 },
    runtimeGrantRefresh,
    liveApplyAllowedByManifest: manifest.executionBoundary?.liveApplyAllowed === true,
    requiresVpcAttachedRunner: manifest.executionBoundary?.requiresVpcAttachedRunner === true,
    requiresReviewedAdminBootstrap: manifest.executionBoundary?.requiresReviewedAdminBootstrap === true
  };
}

export function requireLiveExecutionApproval(plan, env = process.env) {
  const production = plan.target.projectId === "jenfu-ai-pdm-prod";
  const requiredApproval = production ? DEV032_CLOUDSQL_MIGRATION_APPROVAL : DEV046_CLOUDSQL_MIGRATION_APPROVAL;
  const suppliedApproval = production ? env.DEV032_CLOUDSQL_MIGRATION_APPROVAL : env.DEV046_CLOUDSQL_MIGRATION_APPROVAL;
  const suppliedBootstrap = production ? env.DEV032_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED : env.DEV046_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED;
  if (suppliedApproval !== requiredApproval) {
    throw new Error("LIVE_MIGRATION_APPROVAL_MISSING");
  }
  if (suppliedBootstrap !== requiredApproval) {
    throw new Error("ADMIN_BOOTSTRAP_CONFIRMATION_MISSING");
  }
  if (env.PDM_DB_PROVIDER !== "cloud_sql_postgres") throw new Error("PDM_DB_PROVIDER_MUST_BE_CLOUD_SQL_POSTGRES");
  const connectionName = env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME ?? "";
  const isolatedRestore = production && env.DEV032_CLOUDSQL_TARGET_MODE === "isolated_restore";
  if (isolatedRestore) {
    if (env.DEV032_PRODUCTION_SOURCE_DATABASE_MUTATION_ALLOWED !== "false") {
      throw new Error("PRODUCTION_SOURCE_DATABASE_MUTATION_GUARD_MISSING");
    }
    if (!DEV032_ISOLATED_RESTORE_TARGET_PATTERN.test(connectionName) || connectionName === plan.target.connectionName) {
      throw new Error("PDM_CLOUD_SQL_ISOLATED_RESTORE_TARGET_REQUIRED");
    }
  } else if (connectionName !== plan.target.connectionName) {
    throw new Error("PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME_MISMATCH");
  }
  if ((env.PDM_CLOUD_SQL_HOST ?? "127.0.0.1") !== "127.0.0.1") throw new Error("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED");
  if ((env.PDM_CLOUD_SQL_DATABASE ?? "ai_pdm") !== plan.target.databaseName) throw new Error("PDM_CLOUD_SQL_DATABASE_MISMATCH");
  if ((env.PDM_CLOUD_SQL_USER ?? "") !== plan.target.migrationIamDatabaseUser) {
    throw new Error("PDM_CLOUD_SQL_USER_MUST_BE_MIGRATION_IAM_USER");
  }
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim()) {
    throw new Error("STATIC_DATABASE_SECRET_FORBIDDEN");
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) throw new Error("SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN");
}

function connectionConfigFromEnv(plan) {
  return {
    host: "127.0.0.1",
    port: Number.parseInt(process.env.PDM_CLOUD_SQL_PORT || "5432", 10),
    database: plan.target.databaseName,
    user: plan.target.migrationIamDatabaseUser,
    password: undefined,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: Number.parseInt(process.env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS || "60000", 10),
    idleTimeoutMillis: Number.parseInt(process.env.PDM_CLOUD_SQL_IDLE_TIMEOUT_MS || "600000", 10),
    statement_timeout: Number.parseInt(process.env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS || "30000", 10),
    query_timeout: Number.parseInt(process.env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS || "35000", 10),
    application_name: plan.target.projectId === "jenfu-ai-pdm-prod" ? "ai-pdm-dev-032-production-migration-runner" : "ai-pdm-dev-046-migration-runner"
  };
}

async function executeMigrations(plan) {
  const pool = new pg.Pool(connectionConfigFromEnv(plan));
  const client = await pool.connect();
  const appliedVersions = [];
  try {
    await client.query("BEGIN");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock($1) AS acquired", [PDM_MIGRATION_ADVISORY_LOCK_ID]);
    if (lock.rows?.[0]?.acquired !== true) throw new Error("MIGRATION_RUNNER_ALREADY_ACTIVE");
    await client.query(`
      CREATE TABLE IF NOT EXISTS pdm_schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT version, checksum FROM pdm_schema_migrations ORDER BY version");
    const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    for (const migration of plan.schemaMigrations) {
      const existingChecksum = appliedByVersion.get(migration.version);
      const acceptedExistingChecksums = new Set([migration.outputSha256, ...(migration.acceptedExistingChecksums ?? [])]);
      if (existingChecksum && !acceptedExistingChecksums.has(existingChecksum)) {
        throw new Error(`MIGRATION_HISTORY_CHECKSUM_MISMATCH:${migration.version}`);
      }
      if (existingChecksum) continue;
      try {
        await client.query(migration.sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`MIGRATION_SQL_FAILED:${migration.version}:${message}`, { cause: error });
      }
      await client.query("INSERT INTO pdm_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
        migration.version,
        migration.name,
        migration.outputSha256
      ]);
      appliedVersions.push(migration.version);
    }
    await client.query(plan.runtimeGrantRefresh.sql);
    await client.query("COMMIT");
    return { appliedVersions };
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
    manifestPath: plan.manifestPath,
    manifestSha256: plan.manifestSha256,
    target: plan.target,
    schemaMigrationCount: plan.schemaMigrationCount,
    supportFileCount: plan.supportFileCount,
    firstSchemaMigration: plan.schemaMigrations[0]?.output ?? null,
    lastSchemaMigration: plan.schemaMigrations.at(-1)?.output ?? null,
    adminBootstrapRequired: plan.requiresReviewedAdminBootstrap,
    adminBootstrapExecutedByThisRunner: false,
    runtimeGrantRefreshIncluded: Boolean(plan.runtimeGrantRefresh),
    liveApplyAllowedByManifest: plan.liveApplyAllowedByManifest,
    connectionAttempted: mode === "execute",
    explicitApprovalRequired: plan.target.projectId === "jenfu-ai-pdm-prod" ? DEV032_CLOUDSQL_MIGRATION_APPROVAL : DEV046_CLOUDSQL_MIGRATION_APPROVAL
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const manifestPath = argValue("--manifest", process.env.PDM_MIGRATION_PACKAGE_TARGET === "production" ? productionManifestPath : defaultManifestPath);
  try {
    if (args.has("--relation-reconciliation")) {
      const { runDev076StagingRelationReconciliation } = await import("./dev-076-staging-relation-reconciliation.mjs");
      console.log(JSON.stringify(await runDev076StagingRelationReconciliation(), null, 2));
      process.exitCode = 0;
    } else {
    const plan = buildDev046CloudSqlMigrationRunPlan(manifestPath);
    if (!execute) {
      console.log(JSON.stringify(summarizePlan(plan, "dry_run"), null, 2));
    } else {
      requireLiveExecutionApproval(plan);
      const result = await executeMigrations(plan);
      console.log(JSON.stringify({ ...summarizePlan(plan, "execute"), ...result }, null, 2));
    }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
