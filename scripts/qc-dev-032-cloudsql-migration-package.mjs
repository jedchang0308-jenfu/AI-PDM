#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDev032CloudSqlMigrationPackage } from "./dev-032-cloudsql-migration-package.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];
let tempRoot;

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-dev032-cloudsql-package-qc-"));
  const { report, outputs } = await buildDev032CloudSqlMigrationPackage(tempRoot);
  const manifest = JSON.parse(await fsp.readFile(outputs.manifestPath, "utf8"));
  const generatedSqlNames = await fsp.readdir(outputs.sqlDirectory);
  const generatedSql = (await Promise.all(generatedSqlNames.map((name) => fsp.readFile(path.join(outputs.sqlDirectory, name), "utf8")))).join("\n");
  const runner = readProjectFile(root, "scripts/run-dev-046-cloudsql-migrations.mjs");
  const dockerfile = readProjectFile(root, "Dockerfile");
  const production001Compatibility = manifest.migrationHistoryCompatibility.entries.find(
    (entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.version === "001"
  );
  const production001Migration = manifest.orderedSchemaMigrations.find((entry) => entry.version === "001");

  record("DEV032-CLOUDSQL-MIG-001 package identifies production Gate C", report.dev === "DEV-032" && report.phase === "Gate-C-production-clean-seed-migration");
  record("DEV032-CLOUDSQL-MIG-002 target is dedicated production", report.target.projectId === "jenfu-ai-pdm-prod" && report.target.cloudSqlInstance === "ai-pdm-prod-postgres" && report.target.connectionName === "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres");
  record("DEV032-CLOUDSQL-MIG-003 IAM database users are production-only", report.target.runtimeIamDatabaseUser === "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam" && report.target.migrationIamDatabaseUser === "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam");
  record("DEV032-CLOUDSQL-MIG-004 package excludes Supabase RLS and Phase 3B GCS", report.candidatePackage.excludedFiles.some((item) => item.file.endsWith("002_supabase_rls_plan.sql")) && report.candidatePackage.excludedFiles.some((item) => item.file.endsWith("011_gcs_pointer_numbering_continuity.sql")));
  record("DEV032-CLOUDSQL-MIG-005 generated SQL is runner-safe", !/\b(?:anon|authenticated|service_role)\b/iu.test(generatedSql) && !/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/iu.test(generatedSql) && !/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu.test(generatedSql));
  record(
    "DEV032-CLOUDSQL-MIG-006 manifest is immutable, complete and non-authorizing",
    manifest.status === "proposal_only_not_approved_for_live_apply" &&
      manifest.executionBoundary.liveApplyAllowed === false &&
      manifest.orderedSchemaMigrations.length === 38 &&
      manifest.orderedSchemaMigrations.at(0)?.output === "sql/001_initial_schema.cloudsql.sql" &&
      manifest.orderedSchemaMigrations.at(-1)?.output === "sql/040_supervisor_workflow_authority.cloudsql.sql" &&
      manifest.orderedSchemaMigrations.every((item) => item.outputSha256?.length === 64)
  );
  record("DEV032-CLOUDSQL-MIG-007 runner requires production-specific approval", runner.includes("DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED") && runner.includes("DEV032_CLOUDSQL_MIGRATION_APPROVAL") && runner.includes("DEV032_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED"));
  record("DEV032-CLOUDSQL-MIG-008 Docker target selects production package explicitly", dockerfile.includes("MIGRATION_PACKAGE_TARGET=staging") && dockerfile.includes("dev-032:cloudsql-migration-package"));
  record("DEV032-CLOUDSQL-MIG-009 package performs no credential or cloud action", report.executionBoundary.noCredentialLookupPerformed === true && report.executionBoundary.noCloudSqlConnectionAttempted === true && report.executionBoundary.noTerraformAction === true && report.executionBoundary.noGcloudMutation === true);
  record("DEV032-CLOUDSQL-MIG-010 production package has no staging target values", !JSON.stringify(report.target).includes("ai-pdm-stg") && !JSON.stringify(report.target).includes("jenfu-ai-pdm-stg-361825"));
  record(
    "DEV032-CLOUDSQL-MIG-011 production 001 historical checksum is explicit and traceable",
    production001Compatibility?.acceptedExistingChecksums?.length === 1 &&
      production001Compatibility.acceptedExistingChecksums[0] === "309039c3f931a269e42a4350c9295e795eb3e494f6e4ad54abb10e40a90aa387" &&
      production001Compatibility.historicalSourceSha256 === "ea7a9d7b2eed8d54dae07ccebbf0cbc86dbf5b749b2cfd1b3d64ae3c9664785e" &&
      production001Compatibility.historicalOutputSha256 === production001Compatibility.acceptedExistingChecksums[0] &&
      production001Compatibility.historicalManifestCommit === "69a8c1da0c694079940988edbde8c74211f62d19" &&
      production001Compatibility.historicalAppliedAt === "2026-07-15T18:03:18.770Z" &&
      production001Migration?.acceptedExistingChecksums?.length === 1 &&
      production001Migration.acceptedExistingChecksums[0] === production001Compatibility.acceptedExistingChecksums[0] &&
      production001Migration.outputSha256 !== production001Compatibility.acceptedExistingChecksums[0]
  );
} catch (error) {
  record("DEV032-CLOUDSQL-MIG-000 QC execution", false, error instanceof Error ? error.message : String(error));
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failed = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production Cloud SQL migration package QC: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
