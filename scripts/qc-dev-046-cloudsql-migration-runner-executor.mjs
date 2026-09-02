#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  DEV032_CLOUDSQL_ISOLATED_RESTORE_MODE,
  DEV046_CLOUDSQL_MIGRATION_APPROVAL,
  assertDev046CloudSqlMigrationEnvironment,
  assertDev046ReplacementVersions,
  buildDev046CloudSqlMigrationRunPlan,
  resolveDev046MigrationLedgerAction
} from "./run-dev-046-cloudsql-migrations.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
}

try {
  const source = readProjectFile(root, "scripts/run-dev-046-cloudsql-migrations.mjs");
  const dockerfile = readProjectFile(root, "Dockerfile");
  const packageJson = readProjectFile(root, "package.json");
  const plan = buildDev046CloudSqlMigrationRunPlan();
  const productionPlan = buildDev046CloudSqlMigrationRunPlan(
    "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json"
  );

  const dryRun = runNode(["scripts/run-dev-046-cloudsql-migrations.mjs", "--dry-run"]);
  const dryRunPayload = JSON.parse(dryRun.stdout);
  const executeWithoutApproval = runNode(["scripts/run-dev-046-cloudsql-migrations.mjs", "--execute"], {
    PDM_DB_PROVIDER: "cloud_sql_postgres",
    PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: plan.target.connectionName,
    PDM_CLOUD_SQL_DATABASE: plan.target.databaseName,
    PDM_CLOUD_SQL_USER: plan.target.migrationIamDatabaseUser
  });

  record(
    "DEV046-CLOUDSQL-EXEC-001 run plan loads reviewed proposal package",
    plan.schemaMigrationCount >= 18 &&
      plan.supportFileCount === 2 &&
      plan.liveApplyAllowedByManifest === false &&
      plan.requiresVpcAttachedRunner === true &&
      plan.requiresReviewedAdminBootstrap === true
  );
  record(
    "DEV046-CLOUDSQL-EXEC-002 dry-run does not connect or apply SQL",
    dryRun.status === 0 &&
      dryRunPayload.mode === "dry_run" &&
      dryRunPayload.connectionAttempted === false &&
      dryRunPayload.adminBootstrapExecutedByThisRunner === false &&
      dryRunPayload.schemaMigrationCount === plan.schemaMigrationCount &&
      dryRunPayload.manifestSha256 === plan.manifestSha256
  );
  record(
    "DEV046-CLOUDSQL-EXEC-003 execute mode is blocked without explicit approval",
    executeWithoutApproval.status !== 0 &&
      executeWithoutApproval.stderr.includes("LIVE_MIGRATION_APPROVAL_MISSING")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-004 source requires admin bootstrap confirmation separately",
    source.includes("DEV046_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED") &&
      source.includes("ADMIN_BOOTSTRAP_CONFIRMATION_MISSING") &&
      source.includes("adminBootstrapExecutedByThisRunner: false")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-005 source forbids unsafe credential and network shortcuts",
    source.includes("PDM_POSTGRES_URL") &&
      source.includes("PDM_POSTGRES_ADMIN_URL") &&
      source.includes("PDM_CLOUD_SQL_PASSWORD") &&
      source.includes("GOOGLE_APPLICATION_CREDENTIALS") &&
      source.includes("CLOUD_SQL_PROXY_LOCALHOST_REQUIRED")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-006 source uses singleton advisory lock and migration history",
    source.includes('client.query("SET LOCAL ROLE pdm_migration")') &&
      source.indexOf('client.query("SET LOCAL ROLE pdm_migration")') < source.indexOf("CREATE TABLE IF NOT EXISTS pdm_schema_migrations") &&
      source.includes("pg_try_advisory_xact_lock") &&
      source.includes("pdm_schema_migrations") &&
      source.includes("MIGRATION_HISTORY_CHECKSUM_MISMATCH")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-007 source refuses runner-hostile SQL",
    source.includes("MIGRATION_SQL_SUPABASE_ROLE_REFERENCE_FORBIDDEN") &&
      source.includes("MIGRATION_SQL_FORCED_RLS_FORBIDDEN") &&
      source.includes("MIGRATION_SQL_TRANSACTION_WRAPPER_FORBIDDEN") &&
      source.includes("MIGRATION_SQL_NON_TRANSACTIONAL_DDL_FORBIDDEN")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-008 package scripts are registered",
    packageJson.includes('"dev-046:cloudsql-migration-runner:dry-run"') &&
      packageJson.includes('"qc:dev-046-cloudsql-migration-runner-executor"')
  );
  record(
    "DEV046-CLOUDSQL-EXEC-009 Dockerfile has a separate non-default migration-runner target",
    dockerfile.includes("AS migration-runner") &&
      dockerfile.includes("MIGRATION_PACKAGE_TARGET=staging") &&
      dockerfile.includes('if [ "$MIGRATION_PACKAGE_TARGET" = "production" ]') &&
      dockerfile.includes("npm run dev-032:cloudsql-migration-package") &&
      dockerfile.includes("npm run dev-046:cloudsql-migration-package") &&
      dockerfile.includes("scripts/run-dev-046-cloudsql-migrations.mjs") &&
      dockerfile.trimEnd().endsWith('CMD ["node", "server.js"]')
  );
  record(
    "DEV046-CLOUDSQL-EXEC-010 approval constant is exact and discoverable",
    DEV046_CLOUDSQL_MIGRATION_APPROVAL === "DEV-046-STAGING-CLOUDSQL-MIGRATION-APPROVED" &&
      dryRunPayload.explicitApprovalRequired === DEV046_CLOUDSQL_MIGRATION_APPROVAL
  );
  const productionBase = {
    DEV032_CLOUDSQL_MIGRATION_APPROVAL: "DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED",
    DEV032_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED: "DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED",
    PDM_DB_PROVIDER: "cloud_sql_postgres",
    PDM_CLOUD_SQL_DATABASE: productionPlan.target.databaseName,
    PDM_CLOUD_SQL_USER: productionPlan.target.migrationIamDatabaseUser
  };
  const isolatedRestore = {
    ...productionBase,
    DEV032_CLOUDSQL_TARGET_MODE: DEV032_CLOUDSQL_ISOLATED_RESTORE_MODE,
    DEV032_PRODUCTION_SOURCE_DATABASE_MUTATION_ALLOWED: "false",
    PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME:
      "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-c2-a1b2c3"
  };
  const isolatedResult = assertDev046CloudSqlMigrationEnvironment(productionPlan, isolatedRestore);
  record(
    "DEV046-CLOUDSQL-EXEC-011 production rehearsal accepts only a guarded isolated restore target",
    isolatedResult.targetMode === DEV032_CLOUDSQL_ISOLATED_RESTORE_MODE &&
      isolatedResult.productionSourceDatabaseMutationAllowed === false &&
      isolatedResult.connectionName.endsWith("ai-pdm-prod-restore-c2-a1b2c3")
  );
  record(
    "DEV046-CLOUDSQL-EXEC-012 isolated restore mode fails closed for source, malformed target and mutation permission",
    [
      {
        ...isolatedRestore,
        PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: productionPlan.target.connectionName
      },
      {
        ...isolatedRestore,
        PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME:
          "jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres"
      },
      {
        ...isolatedRestore,
        DEV032_PRODUCTION_SOURCE_DATABASE_MUTATION_ALLOWED: "true"
      },
      {
        ...productionBase,
        DEV032_PRODUCTION_SOURCE_DATABASE_MUTATION_ALLOWED: "false",
        PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: productionPlan.target.connectionName
      }
    ].every((env) => {
      try {
        assertDev046CloudSqlMigrationEnvironment(productionPlan, env);
        return false;
      } catch {
        return true;
      }
    })
  );
  const historical048 = productionPlan.schemaMigrations.find((migration) => migration.version === "048");
  const replacement048 = new Map([
    ["048", historical048.acceptedExistingChecksums[0]]
  ]);
  const firstReplacement = resolveDev046MigrationLedgerAction(historical048, replacement048);
  replacement048.set(firstReplacement.ledgerVersion, historical048.outputSha256);
  const repeatedReplacement = resolveDev046MigrationLedgerAction(historical048, replacement048);
  const fresh048 = resolveDev046MigrationLedgerAction(historical048, new Map());
  const current048 = resolveDev046MigrationLedgerAction(
    historical048,
    new Map([["048", historical048.outputSha256]])
  );
  record(
    "DEV046-CLOUDSQL-EXEC-013 historical slot replacement runs once in source order without ledger rewrite",
    firstReplacement.action === "apply" &&
      firstReplacement.ledgerVersion === "057" &&
      firstReplacement.historyReplacementFor === "048" &&
      repeatedReplacement.action === "skip" &&
      repeatedReplacement.ledgerVersion === "057" &&
      fresh048.action === "apply" &&
      fresh048.ledgerVersion === "048" &&
      current048.action === "skip" &&
      current048.ledgerVersion === "048"
  );
  record(
    "DEV046-CLOUDSQL-EXEC-014 replacement versions and checksums fail closed",
    [
      () => resolveDev046MigrationLedgerAction(historical048, new Map([["048", "f".repeat(64)]])),
      () => resolveDev046MigrationLedgerAction(
        historical048,
        new Map([
          ["048", historical048.acceptedExistingChecksums[0]],
          ["057", "e".repeat(64)]
        ])
      ),
      () => assertDev046ReplacementVersions([
        historical048,
        { ...productionPlan.schemaMigrations.find((migration) => migration.version === "049"), replacementVersion: "057" }
      ])
    ].every((operation) => {
      try {
        operation();
        return false;
      } catch {
        return true;
      }
    })
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
