#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEV046_CLOUDSQL_MIGRATION_PACKAGE_VERSION,
  buildDev046CloudSqlMigrationPackage,
  writeDev046CloudSqlMigrationPackage
} from "./dev-046-cloudsql-migration-package.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-dev046-cloudsql-package-qc-"));
  const report = buildDev046CloudSqlMigrationPackage();
  const outputs = await writeDev046CloudSqlMigrationPackage(report, tempRoot);
  const generatorSource = readProjectFile(root, "scripts/dev-046-cloudsql-migration-package.mjs");
  const packageJson = readProjectFile(root, "package.json");
  const manifest = readProjectFile(root, "config/platform/staging-preflight.template.json");
  const devTask = readProjectFile(root, ".ai-doc/dev_task.md");
  const docMap = readProjectFile(root, ".ai-doc/documentation_map.md");
  const stagingReadme = readProjectFile(root, "infra/google-cloud/staging/README.md");

  record("DEV046-CLOUDSQL-MIG-001 package version is stable", report.packageVersion === DEV046_CLOUDSQL_MIGRATION_PACKAGE_VERSION);
  record(
    "DEV046-CLOUDSQL-MIG-002 report is local-only and non-mutating",
    report.executionBoundary.localOnly === true &&
      report.executionBoundary.noCredentialLookupPerformed === true &&
      report.executionBoundary.noCloudSqlConnectionAttempted === true &&
      report.executionBoundary.noSqlApplied === true &&
      report.executionBoundary.noTerraformAction === true &&
      report.executionBoundary.noGcloudMutation === true &&
      report.executionBoundary.noPsqlCommand === true
  );
  record(
    "DEV046-CLOUDSQL-MIG-003 target is the approved staging Cloud SQL instance",
    report.target.projectId === "jenfu-ai-pdm-stg-361825" &&
      report.target.region === "asia-east1" &&
      report.target.cloudSqlInstance === "ai-pdm-stg-postgres" &&
      report.target.databaseName === "ai_pdm" &&
      report.target.privateIpOnly === true
  );
  record(
    "DEV046-CLOUDSQL-MIG-004 source inventory detects the Cloud SQL PostgreSQL package",
    report.sourceInventory.postgresDirectory === "db/postgres" &&
      report.sourceInventory.postgresSqlFileCount >= 20 &&
      report.sourceInventory.postgresReadmeDeclaresCloudSqlAuthority === true
  );
  record(
    "DEV046-CLOUDSQL-MIG-005 Supabase role references are detected rather than ignored",
    report.supabaseCompatibility.cloudSqlReady === false &&
      report.supabaseCompatibility.totalRoleReferenceLines > 10 &&
      report.supabaseCompatibility.byFile.some((item) => item.file === "db/postgres/002_supabase_rls_plan.sql") &&
      report.supabaseCompatibility.byFile.some((item) => item.roles.includes("authenticated"))
  );
  record(
    "DEV046-CLOUDSQL-MIG-006 Phase 3B file-pointer SQL is not silently pulled into the no-file pilot",
    report.sourceInventory.currentPostgresMigrations.some(
      (migration) => migration.file === "db/postgres/011_gcs_pointer_numbering_continuity.sql" &&
        migration.phaseBoundary === "deferred_phase_3b_file_authority"
    )
  );
  record(
    "DEV046-CLOUDSQL-MIG-007 DDL review findings are visible",
    report.ddlRisk.totalReviewLines > 0 &&
      report.ddlRisk.reviewRequiredIdempotentLines > 0 &&
      Number.isInteger(report.ddlRisk.blockingDestructiveLines)
  );
  record(
    "DEV046-CLOUDSQL-MIG-008 admin bootstrap is required and tied to the Cloud SQL grant file",
    report.adminBootstrap.required === true &&
      report.adminBootstrap.file === "db/cloud-sql/pdm_runtime_grants.sql" &&
      report.adminBootstrap.createsRuntimeRole === true &&
      report.adminBootstrap.createsMigrationRole === true &&
      report.adminBootstrap.grantsIamUsers === true
  );
  record(
    "DEV046-CLOUDSQL-MIG-009 private-IP execution requires a VPC-attached runner",
    report.executionEnvironment.privateIpOnly === true &&
      report.executionEnvironment.proxyRequiresVpcReachability === true &&
      report.executionEnvironment.vpcAttachedRunnerRequired === true &&
      report.executionEnvironment.localMachineDirectApplyAllowed === false
  );
  record(
    "DEV046-CLOUDSQL-MIG-010 current candidate readiness is bound to exact manifest evidence",
    report.readiness.readyForLiveApply === false &&
      report.liveExecutionEvidence.candidateManifestSha256.length === 64 &&
      report.liveExecutionEvidence.candidateSchemaMigrationCount === report.candidatePackage.orderedSchemaMigrationCount &&
      report.readiness.liveMigrationCompleted === report.liveExecutionEvidence.matchesCurrentCandidate &&
      (report.liveExecutionEvidence.matchesCurrentCandidate
        ? report.readiness.cloudSqlMigrationPackageReady === true && report.liveExecutionEvidence.idempotenceVerified === true
        : report.readiness.cloudSqlMigrationPackageReady === false && report.readiness.blockers.length > 0)
  );
  record(
    "DEV046-CLOUDSQL-MIG-011 candidate package is generated for review only",
    report.candidatePackage.status === "proposal_generated_not_reviewed" &&
      report.candidatePackage.readyForPackageReview === true &&
      report.candidatePackage.liveApplyAllowed === false &&
      report.candidatePackage.orderedSchemaMigrationCount >= 18
  );
  record(
    "DEV046-CLOUDSQL-MIG-012 candidate excludes Supabase RLS baseline and Phase 3B GCS pointer SQL",
    report.candidatePackage.excludedFiles.some(
      (item) => item.file === "db/postgres/002_supabase_rls_plan.sql" &&
        item.reason === "supabase_rls_baseline_excluded_for_cloud_sql_bff_runtime"
    ) &&
      report.candidatePackage.excludedFiles.some(
        (item) => item.file === "db/postgres/011_gcs_pointer_numbering_continuity.sql" &&
          item.reason === "phase_3b_file_authority_deferred"
      )
  );
  record(
    "DEV046-CLOUDSQL-MIG-013 candidate removes runner-hostile wrappers, Supabase roles and forced RLS",
    report.candidatePackage.transformations.removedTransactionWrappers > 0 &&
      report.candidatePackage.transformations.rewrittenSupabaseRoleReferences > 0 &&
      report.candidatePackage.transformations.removedRlsStatements > 0 &&
      report.candidatePackage.transformations.remainingSupabaseRoleReferences === 0 &&
      report.candidatePackage.transformations.remainingRlsStatements === 0 &&
      report.candidatePackage.transformations.remainingTransactionWrappers === 0
  );
  record(
    "DEV046-CLOUDSQL-MIG-014 required next work matches current candidate state",
    report.liveExecutionEvidence.runtimeSmokeBoundToCurrentCandidate
      ? report.requiredNextWork.some((item) => item.includes("principal mapping")) &&
        report.requiredNextWork.some((item) => item.includes("artifact provenance"))
      : report.liveExecutionEvidence.matchesCurrentCandidate
        ? report.requiredNextWork.some((item) => item.includes("runtime smoke"))
      : report.requiredNextWork.some((item) => item.includes("ordered migration manifest")) &&
        report.requiredNextWork.some((item) => item.includes("runtime smoke"))
  );
  record(
    "DEV046-CLOUDSQL-MIG-015 output files are written",
    (await exists(outputs.jsonPath)) &&
      (await exists(outputs.markdownPath)) &&
      (await exists(outputs.manifestPath)) &&
      (await exists(outputs.runnerContractPath)) &&
      (await exists(path.join(outputs.sqlDirectory, "000_admin_bootstrap_grants.sql"))) &&
      (await exists(path.join(outputs.sqlDirectory, "999_runtime_grants_refresh.sql")))
  );
  record(
    "DEV046-CLOUDSQL-MIG-016 package scripts are registered",
    packageJson.includes('"dev-046:cloudsql-migration-package"') &&
      packageJson.includes('"qc:dev-046-cloudsql-migration-package"')
  );
  record(
    "DEV046-CLOUDSQL-MIG-017 generator source does not execute cloud or database CLIs",
    !/from\s+"node:child_process"|from\s+'node:child_process'|spawnSync|execFile|execSync|spawn\(|exec\(/iu.test(generatorSource)
  );
  record(
    "DEV046-CLOUDSQL-MIG-018 staging preflight closes migration and records later runtime smoke",
    manifest.includes('"officialMigrationApplyExecuted": true') &&
      manifest.includes('"idempotenceVerified": true') &&
      manifest.includes('"runtimeSmokeExecuted": true') &&
      manifest.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING") &&
      !manifest.includes("STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY")
  );
  record(
    "DEV046-CLOUDSQL-MIG-019 docs expose completed staging migration without claiming production acceptance",
    devTask.includes("Phase 2B staging activation 已完成") &&
      devTask.includes("DEV-032 Gate A-E") &&
      docMap.includes("live migration") &&
      stagingReadme.includes("Do not apply `db/postgres/*.sql` directly to Cloud SQL")
  );

  const generatedSqlFileNames = await fsp.readdir(outputs.sqlDirectory);
  const generatedSql = (await Promise.all(generatedSqlFileNames.map((name) => fsp.readFile(path.join(outputs.sqlDirectory, name), "utf8")))).join("\n");
  record(
    "DEV046-CLOUDSQL-MIG-020 generated candidate SQL has no Supabase role references, RLS force or transaction wrappers",
    !/\b(?:anon|authenticated|service_role)\b/iu.test(generatedSql) &&
      !/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/iu.test(generatedSql) &&
      !/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu.test(generatedSql)
  );
  const candidateManifest = JSON.parse(await fsp.readFile(outputs.manifestPath, "utf8"));
  record(
    "DEV046-CLOUDSQL-MIG-021 generated manifest is traceable and excludes live apply",
    candidateManifest.status === "proposal_only_not_approved_for_live_apply" &&
      candidateManifest.executionBoundary.liveApplyAllowed === false &&
      candidateManifest.orderedSchemaMigrations.every((item) => typeof item.sourceSha256 === "string" && item.sourceSha256.length === 64) &&
      candidateManifest.orderedSchemaMigrations.every((item) => typeof item.outputSha256 === "string" && item.outputSha256.length === 64)
  );

  const serialized = JSON.stringify(report);
  record(
    "DEV046-CLOUDSQL-MIG-022 output has no common credential markers",
    !/(ya29\.|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|service_account_key|refresh_token|client_secret)/iu.test(serialized)
  );

  const numberingV2Sql = await fsp.readFile(path.join(outputs.sqlDirectory, "004_numbering_v2_compact_identity.cloudsql.sql"), "utf8");
  const adminBootstrapSql = await fsp.readFile(path.join(outputs.sqlDirectory, "000_admin_bootstrap_grants.sql"), "utf8");
  const runtimeGrantRefreshSql = await fsp.readFile(path.join(outputs.sqlDirectory, "999_runtime_grants_refresh.sql"), "utf8");
  const v1SeedIndex = numberingV2Sql.indexOf("'numbering-rule-v1',\n  'PDM-NUMBERING-V1'");
  const approvalRuleInsertIndex = numberingV2Sql.indexOf("INSERT INTO approval_rules");
  record(
    "DEV046-CLOUDSQL-MIG-023 v1 rule seed precedes approval-rule foreign keys",
    v1SeedIndex >= 0 && approvalRuleInsertIndex > v1SeedIndex
  );
  record(
    "DEV046-CLOUDSQL-MIG-024 managed postgres bootstrap avoids cross-role default privileges",
    !/ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+pdm_migration/iu.test(generatedSql) &&
      runtimeGrantRefreshSql.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pdm_runtime")
  );
  record(
    "DEV046-CLOUDSQL-MIG-025 fresh install activates v3 rule and seeds its approval rules",
    numberingV2Sql.includes("'numbering-rule-v3-alpha-root',\n  'PDM-NUMBERING-V3'") &&
      numberingV2Sql.includes("SET status = 'active', retired_at = NULL, updated_at = now()\nWHERE id = 'numbering-rule-v3-alpha-root'") &&
      numberingV2Sql.includes("'v3-' || id, 'numbering-rule-v3-alpha-root'")
  );
  const roleCatalogSql = await fsp.readFile(
    path.join(outputs.sqlDirectory, "055_jenfu_role_catalog_publication.cloudsql.sql"),
    "utf8"
  );
  record(
    "DEV046-CLOUDSQL-MIG-026 Jenfu platform roles are deterministically mapped to managed Cloud SQL roles",
    report.candidatePackage.transformations.rewrittenJenfuPlatformRoleReferences > 0 &&
      roleCatalogSql.includes("SET LOCAL ROLE pdm_migration") &&
      roleCatalogSql.includes("CLOUDSQL_ADMIN_BOOTSTRAP_SCHEMA_MISSING_OR_MISOWNED:ai_pdm_contract") &&
      roleCatalogSql.includes("ALTER SCHEMA ai_pdm_contract OWNER TO pdm_migration") &&
      !roleCatalogSql.includes("CREATE SCHEMA IF NOT EXISTS ai_pdm_contract") &&
      roleCatalogSql.includes("TO pdm_runtime") &&
      !/\bjenfu_(?:platform_migrator|platform_runtime|orgmaster_runtime|ai_pdm_runtime)\b/u.test(roleCatalogSql) &&
      !/\bpdm_runtime\s*,\s*pdm_runtime\b/u.test(roleCatalogSql)
  );
  record(
    "DEV046-CLOUDSQL-MIG-027 privileged bootstrap pre-creates the contract schema without database-wide CREATE",
    adminBootstrapSql.includes("CREATE SCHEMA IF NOT EXISTS ai_pdm_contract AUTHORIZATION pdm_migration") &&
      adminBootstrapSql.includes("ALTER SCHEMA ai_pdm_contract OWNER TO pdm_migration") &&
      !/GRANT\s+CREATE\s+ON\s+DATABASE[\s\S]*?TO\s+pdm_migration/iu.test(adminBootstrapSql)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
