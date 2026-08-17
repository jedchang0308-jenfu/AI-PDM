#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEV046_CLOUDSQL_MIGRATION_RUNNER_PACKAGE_VERSION,
  buildDev046CloudSqlMigrationRunnerPackage,
  writeDev046CloudSqlMigrationRunnerPackage
} from "./dev-046-cloudsql-migration-runner-package.mjs";
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
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-dev046-cloudsql-runner-qc-"));
  const report = buildDev046CloudSqlMigrationRunnerPackage();
  const outputs = await writeDev046CloudSqlMigrationRunnerPackage(report, tempRoot);
  const generatorSource = readProjectFile(root, "scripts/dev-046-cloudsql-migration-runner-package.mjs");
  const packageJson = readProjectFile(root, "package.json");
  const manifest = readProjectFile(root, "config/platform/staging-preflight.template.json");
  const devTask = readProjectFile(root, ".ai-doc/dev_task.md");
  const docMap = readProjectFile(root, ".ai-doc/documentation_map.md");
  const stagingReadme = readProjectFile(root, "infra/google-cloud/staging/README.md");
  const runnerTf = readProjectFile(root, "infra/google-cloud/staging/migration-runner.tf");
  const localsTf = readProjectFile(root, "infra/google-cloud/staging/locals.tf");
  const tfvarsExample = readProjectFile(root, "infra/google-cloud/staging/terraform.tfvars.example");

  record(
    "DEV046-CLOUDSQL-RUNNER-001 package version is stable",
    report.packageVersion === DEV046_CLOUDSQL_MIGRATION_RUNNER_PACKAGE_VERSION
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-002 report is local-only and non-mutating",
    report.executionBoundary.localOnly === true &&
      report.executionBoundary.noCredentialLookupPerformed === true &&
      report.executionBoundary.noCloudSqlConnectionAttempted === true &&
      report.executionBoundary.noSqlApplied === true &&
      report.executionBoundary.noTerraformAction === true &&
      report.executionBoundary.noGcloudMutation === true &&
      report.executionBoundary.noPsqlCommand === true &&
      report.executionBoundary.noCloudRunJobActionPerformedByThisCommand === true &&
      report.executionBoundary.cloudRunJobCreatedByReviewedApply === true
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-003 target is approved staging Cloud SQL",
    report.target.projectId === "jenfu-ai-pdm-stg-361825" &&
      report.target.region === "asia-east1" &&
      report.target.cloudSqlInstance === "ai-pdm-stg-postgres" &&
      report.target.privateIpOnly === true
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-004 migration package input is proposal-only",
    report.migrationPackage.manifestPresent === true &&
      report.migrationPackage.status === "proposal_only_not_approved_for_live_apply" &&
      report.migrationPackage.liveApplyAllowed === false &&
      report.migrationPackage.requiresVpcAttachedRunner === true &&
      report.migrationPackage.orderedSchemaMigrationCount >= 18
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-005 service keeps private Cloud SQL and an explicit staging Hosting exception",
    report.servicePattern.cloudRunServicePresent === true &&
      report.servicePattern.defaultUrlPolicyConditional === true &&
      report.servicePattern.ingressPolicyConditional === true &&
      report.servicePattern.firebaseHostingGatewayDefaultDisabled === true &&
      report.servicePattern.vpcAccessPresent === true &&
      report.servicePattern.cloudSqlProxyPrivateIamPresent === true
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-006 runtime and migration identities are separate",
    report.identity.runtimeServiceAccountPresent === true &&
      report.identity.migrationServiceAccountPresent === true &&
      report.identity.runtimeIamDbUserPresent === true &&
      report.identity.migrationIamDbUserPresent === true &&
      report.identity.runtimeAndMigrationSeparated === true
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-007 approved migration executed and Job restored to dry-run",
    report.terraformRunnerIac.cloudRunJobPresent === true &&
      report.terraformRunnerIac.cloudRunJobApplyExecuted === true &&
      report.terraformRunnerIac.cloudRunJobApplyVerified === true &&
      report.terraformRunnerIac.cloudRunJobExecutionRequested === true &&
      report.terraformRunnerIac.cloudRunJobExecuted === true &&
      report.liveExecutionEvidence.liveMigrationCompleted === true &&
      report.liveExecutionEvidence.idempotenceVerified === true &&
      report.liveExecutionEvidence.jobRestoredToDryRun === true &&
      report.terraformRunnerIac.liveApplyAllowed === false
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-007A Cloud Run Job uses migration identity and private IAM proxy",
    report.terraformRunnerIac.runnerUsesMigrationServiceAccount === true &&
      report.terraformRunnerIac.runnerHasCloudSqlProxyPattern === true &&
      runnerTf.includes("google_service_account.migration[0].email") &&
      runnerTf.includes("--private-ip") &&
      runnerTf.includes("--auto-iam-authn")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-007B Cloud Run Job remains review-gated and disabled by default",
    report.terraformRunnerIac.runnerReviewGuardPresent === true &&
      report.terraformRunnerIac.defaultDisabledInTfvarsExample === true &&
      localsTf.includes("migration_runner_job_guard") &&
      localsTf.includes("DEV-046-STAGING-MIGRATION-RUNNER-JOB-REVIEWED") &&
      tfvarsExample.includes("enable_migration_runner_job    = false")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-007C Cloud Run Job command is dry-run only with no live approval env",
    report.terraformRunnerIac.runnerDryRunOnly === true &&
      report.terraformRunnerIac.runnerLiveApprovalEnvAbsent === true &&
      runnerTf.includes('"--dry-run"') &&
      !runnerTf.includes('"--execute"') &&
      !runnerTf.includes("DEV046_CLOUDSQL_MIGRATION_APPROVAL") &&
      !runnerTf.includes("DEV046_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-008 Dockerfile exposes migration-runner target while web runner remains default",
    report.runtimeImage.copiesNextStandalone === true &&
      report.runtimeImage.copiesNextStatic === true &&
      report.runtimeImage.copiesInfra === true &&
      report.runtimeImage.copiesSourceLib === true &&
      report.runtimeImage.copiesMigrationAssets === true &&
      report.runtimeImage.webServerCommandOnly === true &&
      report.runtimeImage.migrationCapable === true
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-009 executable migration command is present but still gated",
    report.applicationMigrationExecutor.present === true &&
      report.applicationMigrationExecutor.singletonPrimitivePresent === true &&
      report.applicationMigrationExecutor.singletonPrimitiveIsLibraryOnly === false
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-010 runner and runtime smoke are complete while staging acceptance remains gated",
    report.readiness.readyForLiveMigration === false &&
      report.readiness.liveMigrationCompleted === true &&
      report.liveExecutionEvidence.runtimeSmokeExecuted === true &&
      report.readiness.topLevelBlockerCoveredBy === null &&
      report.readiness.blockers.length === 2 &&
      !report.readiness.blockers.includes("STAGING_MIGRATION_RUNNER_IMAGE_NOT_PACKAGED") &&
      !report.readiness.blockers.includes("STAGING_CLOUD_RUN_JOB_IAC_NOT_PRESENT") &&
      !report.readiness.blockers.includes("STAGING_CLOUD_RUN_JOB_APPLY_NOT_EXECUTED") &&
      !report.readiness.blockers.includes("STAGING_CLOUD_RUN_JOB_APPLY_EVIDENCE_MISSING") &&
      !report.readiness.blockers.includes("STAGING_CLOUD_RUN_JOB_EXECUTION_UNAPPROVED") &&
      !report.readiness.blockers.includes("STAGING_MIGRATION_RUNNER_EXECUTOR_NOT_IMPLEMENTED") &&
      !report.readiness.blockers.includes("STAGING_RUNTIME_SMOKE_NOT_EXECUTED") &&
      report.readiness.blockers.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING") &&
      report.readiness.blockers.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-011 required next work names principal mapping and artifact provenance",
    report.requiredNextWork.some((item) => item.includes("principal mapping")) &&
      report.requiredNextWork.some((item) => item.includes("artifact provenance")) &&
      !report.requiredNextWork.some((item) => item.includes("runtime smoke"))
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-012 output files are written",
    (await exists(outputs.jsonPath)) &&
      (await exists(outputs.markdownPath)) &&
      (await exists(outputs.contractPath))
  );
  const contract = await fsp.readFile(outputs.contractPath, "utf8");
  record(
    "DEV046-CLOUDSQL-RUNNER-013 generated contract forbids unsafe shortcuts",
    contract.includes("Cloud Run Job or equivalent one-shot runner") &&
      contract.includes("dedicated migration service account") &&
      contract.includes("automatic IAM database authentication") &&
      contract.includes("Do not apply `db/postgres/*.sql` directly to Cloud SQL") &&
      contract.includes("static database passwords")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-014 package scripts are registered",
    packageJson.includes('"dev-046:cloudsql-migration-runner-package"') &&
      packageJson.includes('"qc:dev-046-cloudsql-migration-runner-package"')
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-015 generator source does not execute cloud or database CLIs",
    !/from\s+"node:child_process"|from\s+'node:child_process'|spawnSync|execFile|execSync|spawn\(|exec\(/iu.test(generatorSource)
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-016 staging preflight records migration completion and current acceptance blockers",
    manifest.includes("cloudSqlMigrationRunnerPreflight") &&
      manifest.includes('"adminBootstrapExecuted": true') &&
      manifest.includes('"cloudRunJobApplyExecuted": true') &&
      manifest.includes('"cloudRunJobExecuted": true') &&
      manifest.includes('"jobRestoredToDryRun": true') &&
      !manifest.includes("STAGING_ADMIN_BOOTSTRAP_PATH_NOT_APPROVED") &&
      !manifest.includes("STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY") &&
      !manifest.includes("STAGING_INTERNAL_HTTPS_ENTRYPOINT_NOT_CONFIGURED") &&
      !manifest.includes("STAGING_RUNTIME_SMOKE_NOT_EXECUTED") &&
      manifest.includes("STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING") &&
      manifest.includes("STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING")
  );
  record(
    "DEV046-CLOUDSQL-RUNNER-017 docs expose migration result without claiming staging acceptance",
    devTask.includes("output/dev-046-live-migration/execution-summary.json") &&
      docMap.includes("live migration") &&
      stagingReadme.includes("Local migration-runner preflight") &&
      stagingReadme.includes("execution-summary.json")
  );
  const serialized = JSON.stringify(report);
  record(
    "DEV046-CLOUDSQL-RUNNER-018 output has no common credential markers",
    !/(ya29\.|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|service_account_key|refresh_token|client_secret)/iu.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
