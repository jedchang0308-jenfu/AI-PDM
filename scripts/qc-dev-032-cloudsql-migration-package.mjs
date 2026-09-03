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
  const roleCatalogSql = await fsp.readFile(
    path.join(outputs.sqlDirectory, "055_jenfu_role_catalog_publication.cloudsql.sql"),
    "utf8"
  );
  const adminBootstrapSql = await fsp.readFile(
    path.join(outputs.sqlDirectory, "000_admin_bootstrap_grants.sql"),
    "utf8"
  );
  const incrementalContractSchemaBootstrapSql = await fsp.readFile(
    path.join(outputs.sqlDirectory, "001_ai_pdm_contract_schema_bootstrap.sql"),
    "utf8"
  );
  const runner = readProjectFile(root, "scripts/run-dev-046-cloudsql-migrations.mjs");
  const dockerfile = readProjectFile(root, "Dockerfile");
  const production001Compatibility = manifest.migrationHistoryCompatibility.entries.find(
    (entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.version === "001"
  );
  const production001Migration = manifest.orderedSchemaMigrations.find((entry) => entry.version === "001");
  const production047Compatibility = manifest.migrationHistoryCompatibility.entries.find(
    (entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.version === "047"
  );
  const production047Migration = manifest.orderedSchemaMigrations.find((entry) => entry.version === "047");
  const production012Compatibility = manifest.migrationHistoryCompatibility.entries.find(
    (entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.version === "012"
  );
  const production027Compatibility = manifest.migrationHistoryCompatibility.entries.find(
    (entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.version === "027"
  );
  const replacementHistory = new Map(
    manifest.migrationHistoryCompatibility.entries
      .filter((entry) => entry.targetProjectId === "jenfu-ai-pdm-prod" && entry.replacementVersion)
      .map((entry) => [entry.version, entry])
  );

  record("DEV032-CLOUDSQL-MIG-001 package identifies production Gate C", report.dev === "DEV-032" && report.phase === "Gate-C-production-clean-seed-migration");
  record("DEV032-CLOUDSQL-MIG-002 target is dedicated production", report.target.projectId === "jenfu-ai-pdm-prod" && report.target.cloudSqlInstance === "ai-pdm-prod-postgres" && report.target.connectionName === "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres");
  record("DEV032-CLOUDSQL-MIG-003 IAM database users are production-only", report.target.runtimeIamDatabaseUser === "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam" && report.target.migrationIamDatabaseUser === "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam");
  record("DEV032-CLOUDSQL-MIG-004 package excludes Supabase RLS and Phase 3B GCS", report.candidatePackage.excludedFiles.some((item) => item.file.endsWith("002_supabase_rls_plan.sql")) && report.candidatePackage.excludedFiles.some((item) => item.file.endsWith("011_gcs_pointer_numbering_continuity.sql")));
  record("DEV032-CLOUDSQL-MIG-005 generated SQL is runner-safe", !/\b(?:anon|authenticated|service_role)\b/iu.test(generatedSql) && !/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/iu.test(generatedSql) && !/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu.test(generatedSql));
  record(
    "DEV032-CLOUDSQL-MIG-006 manifest is immutable, complete and non-authorizing",
      manifest.status === "proposal_only_not_approved_for_live_apply" &&
      manifest.executionBoundary.liveApplyAllowed === false &&
      manifest.orderedSchemaMigrations.length === 50 &&
      manifest.orderedSchemaMigrations.at(0)?.output === "sql/001_initial_schema.cloudsql.sql" &&
      manifest.orderedSchemaMigrations.at(-1)?.output === "sql/052_retired_workbench_residue_cleanup.cloudsql.sql" &&
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
  record(
    "DEV032-CLOUDSQL-MIG-012 production 047 historical retirement is immutable and forward-reconciled",
    production047Compatibility?.acceptedExistingChecksums?.length === 1 &&
      production047Compatibility.acceptedExistingChecksums[0] === "1e3b9ab54421c3296d8f385f788b057b837e15cc6e7a7f1a8d9932a726a316f2" &&
      production047Compatibility.historicalSourceSha256 === "c18c284da2a2b25adc6fc1c34501c7317d2ebbe0a44eb16d6d04075e2e53c450" &&
      production047Compatibility.historicalOutputSha256 === production047Compatibility.acceptedExistingChecksums[0] &&
      production047Compatibility.historicalManifestCommit === "d9c84367" &&
      production047Compatibility.historicalAppliedAt === "2026-08-24T11:02:17.741Z" &&
      production047Migration?.acceptedExistingChecksums?.length === 1 &&
      production047Migration.acceptedExistingChecksums[0] === production047Compatibility.acceptedExistingChecksums[0] &&
      production047Migration.outputSha256 === production047Compatibility.acceptedExistingChecksums[0] &&
      manifest.orderedSchemaMigrations.every((entry) => entry.output !== "sql/048_shared_assembly_bom.cloudsql.sql")
  );
  record(
    "DEV032-CLOUDSQL-MIG-013 production 012 and 027 source drift is explicit and owned by forward migrations",
    production012Compatibility?.acceptedExistingChecksums?.[0] === "275a0d501314bf9c8b09651b2eee448d6ff4f16944777c75d5922d51441bae11" &&
      production012Compatibility.historicalSourceSha256 === "394683bcf1acbcb09a73d53a9d6ab184a3f313d8a8729a485f84a8231a40dd88" &&
      production012Compatibility.historicalManifestCommit === "36d1f598" &&
      production027Compatibility?.acceptedExistingChecksums?.[0] === "5736286935a42e9df57493fe4b397f540c6f519ea48344bf51fec2928aae16e8" &&
      production027Compatibility.historicalSourceSha256 === "d6a34e44fd310f921c3df68a93da8f9605425f2b813b6073a5e307460ca6b4c5" &&
      production027Compatibility.historicalManifestCommit === "72fed58d" &&
      manifest.orderedSchemaMigrations.find((entry) => entry.version === "012")?.acceptedExistingChecksums?.[0] === production012Compatibility.acceptedExistingChecksums[0] &&
      manifest.orderedSchemaMigrations.find((entry) => entry.version === "027")?.acceptedExistingChecksums?.[0] === production027Compatibility.acceptedExistingChecksums[0] &&
      manifest.orderedSchemaMigrations.some((entry) => entry.version === "044") &&
      manifest.orderedSchemaMigrations.some((entry) => entry.version === "048")
  );
  const expectedReplacementHistory = {
    "048": ["057", "5871eee45fd2e3719900721ccb813ce24d0027b4dfcd79150f2315b872ca99f1"],
    "049": ["058", "ab45b6ec802dbf9cf74754e2ddcaedbf2e407580c436ce145c395e44e8a3d7ff"],
    "050": ["059", "2747049f0efbc19896e6bd7184770d4e62b6356cc9d9f10dc68ecb0bb5d516f7"],
    "051": ["060", "6c344a3345cd4cd6d82f86b34855032af6d8b859a81bc36f70249f113e7faa53"],
    "052": ["061", "46f2731dbbaff3e8fcead6a9fefd7542c3565ff5a40475c140b3383e3bdcf69e"]
  };
  record(
    "DEV032-CLOUDSQL-MIG-014 reused production slots execute under unique forward replacement versions",
    replacementHistory.size === 5 &&
      Object.entries(expectedReplacementHistory).every(([version, [replacementVersion, historicalChecksum]]) => {
        const compatibility = replacementHistory.get(version);
        const migration = manifest.orderedSchemaMigrations.find((entry) => entry.version === version);
        return compatibility?.replacementVersion === replacementVersion &&
          compatibility.acceptedExistingChecksums?.length === 1 &&
          compatibility.acceptedExistingChecksums[0] === historicalChecksum &&
          compatibility.historicalOutputSha256 === historicalChecksum &&
          migration?.replacementVersion === replacementVersion &&
          migration.acceptedExistingChecksums?.[0] === historicalChecksum &&
          migration.outputSha256 !== historicalChecksum;
      }) &&
      new Set(Object.values(expectedReplacementHistory).map(([replacementVersion]) => replacementVersion)).size === 5
  );
  record(
    "DEV032-CLOUDSQL-MIG-015 role catalog SQL uses provisioned managed Cloud SQL roles only",
    report.candidatePackage.transformations.rewrittenJenfuPlatformRoleReferences > 0 &&
      roleCatalogSql.includes("SET LOCAL ROLE pdm_migration") &&
      roleCatalogSql.includes("CLOUDSQL_ADMIN_BOOTSTRAP_SCHEMA_MISSING_OR_INACCESSIBLE:ai_pdm_contract") &&
      roleCatalogSql.includes("CLOUDSQL_ADMIN_BOOTSTRAP_RETAINS_AI_PDM_CONTRACT_SCHEMA_OWNERSHIP") &&
      roleCatalogSql.includes("CLOUDSQL_ADMIN_BOOTSTRAP_REVOKED_PUBLIC_AI_PDM_CONTRACT_SCHEMA_ACCESS") &&
      roleCatalogSql.includes("CLOUDSQL_ADMIN_BOOTSTRAP_GRANTED_RUNTIME_AI_PDM_CONTRACT_SCHEMA_USAGE") &&
      !roleCatalogSql.includes("CREATE SCHEMA IF NOT EXISTS ai_pdm_contract") &&
      !roleCatalogSql.includes("ALTER SCHEMA ai_pdm_contract OWNER TO pdm_migration") &&
      roleCatalogSql.includes("TO pdm_runtime") &&
      !/\bjenfu_(?:platform_migrator|platform_runtime|orgmaster_runtime|ai_pdm_runtime)\b/u.test(roleCatalogSql) &&
      !/\bpdm_runtime\s*,\s*pdm_runtime\b/u.test(roleCatalogSql)
  );
  record(
    "DEV032-CLOUDSQL-MIG-016 privileged bootstrap retains the contract boundary with scoped migration DDL",
    adminBootstrapSql.includes("CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;") &&
      adminBootstrapSql.includes("REVOKE ALL ON SCHEMA ai_pdm_contract FROM PUBLIC") &&
      adminBootstrapSql.includes("GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration") &&
      adminBootstrapSql.includes("GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime") &&
      !adminBootstrapSql.includes("AUTHORIZATION pdm_migration") &&
      !/GRANT\s+CREATE\s+ON\s+DATABASE[\s\S]*?TO\s+pdm_migration/iu.test(adminBootstrapSql) &&
      incrementalContractSchemaBootstrapSql.includes("CREATE SCHEMA IF NOT EXISTS ai_pdm_contract;") &&
      incrementalContractSchemaBootstrapSql.includes("GRANT USAGE, CREATE ON SCHEMA ai_pdm_contract TO pdm_migration") &&
      incrementalContractSchemaBootstrapSql.includes("GRANT USAGE ON SCHEMA ai_pdm_contract TO pdm_runtime") &&
      !incrementalContractSchemaBootstrapSql.includes("CREATE ROLE") &&
      !incrementalContractSchemaBootstrapSql.includes("ON ALL TABLES IN SCHEMA public") &&
      !incrementalContractSchemaBootstrapSql.includes("GRANT CONNECT ON DATABASE")
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
