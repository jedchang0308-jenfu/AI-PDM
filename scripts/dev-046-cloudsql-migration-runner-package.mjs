#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEV046_CLOUDSQL_MIGRATION_RUNNER_PACKAGE_VERSION = "dev-046-cloudsql-migration-runner-package/v1";

const root = process.cwd();
const defaultOutputDir = path.join(root, "output", "dev-046-cloudsql-migration-runner-package");
const migrationPackageManifestPath = "output/dev-046-cloudsql-migration-package/cloudsql-migration-manifest.json";
const migrationRunnerApplySummaryPath = "output/dev-046-migration-runner-plan/apply-summary.json";
const liveExecutionEvidencePath = "output/dev-046-live-migration/execution-summary.json";

function projectPath(relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function readIfExists(relativePath, fallback = "") {
  return exists(relativePath) ? read(relativePath) : fallback;
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function jsonIfExists(relativePath) {
  return exists(relativePath) ? json(relativePath) : null;
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function hasTerraformResource(source, type) {
  return new RegExp(`resource\\s+"${type}"`, "u").test(source);
}

function buildRunnerContractMarkdown(report) {
  const lines = [
    "# DEV-046 Cloud SQL Migration Runner Readiness Contract",
    "",
    `Status: ${report.readiness.status}`,
    "",
    "## Current Result",
    "",
    `- Readiness: ${report.readiness.status}`,
    `- Live migration allowed: ${report.readiness.readyForLiveMigration}`,
    `- Cloud Run Job IaC present: ${report.terraformRunnerIac.cloudRunJobPresent}`,
    `- Cloud Run Job apply executed: ${report.terraformRunnerIac.cloudRunJobApplyExecuted}`,
    `- Cloud Run Job execution requested: ${report.terraformRunnerIac.cloudRunJobExecutionRequested}`,
    `- Cloud Run Job dry-run only: ${report.terraformRunnerIac.runnerDryRunOnly}`,
    `- Migration-capable image present: ${report.runtimeImage.migrationCapable}`,
    "",
    "## Required Runner Shape",
    "",
    "- Use a reviewed Cloud Run Job or equivalent one-shot runner attached to the staging VPC.",
    "- Run as the dedicated migration service account, not the normal app runtime service account.",
    "- Reach Cloud SQL through private IP and Cloud SQL Auth Proxy or an equivalent connector with automatic IAM database authentication.",
    "- Package the reviewed migration manifest and SQL artifacts immutably with the runner image or reviewed execution artifact.",
    "- Keep the web Cloud Run service image and command separate from live migration execution.",
    "- Keep admin bootstrap, schema migration, runtime grant refresh, runtime smoke and principal mapping as ordered gates.",
    "",
    "## Forbidden Shortcuts",
    "",
    "- Do not apply `db/postgres/*.sql` directly to Cloud SQL.",
    "- Do not use static database passwords, service-account keys, public Cloud SQL IP, local private-IP tunneling, browser-direct DB access or Firebase data triggers.",
    "- Do not run or repeat live migration without explicit approval and a reviewed immutable artifact.",
    "",
    "## Current Blockers",
    ""
  ];

  for (const blocker of report.readiness.blockers) lines.push(`- ${blocker}`);
  return `${lines.join("\n")}\n`;
}

function buildMarkdown(report) {
  const lines = [
    "# DEV-046 Cloud SQL Migration Runner Package Preflight",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    `Status: ${report.readiness.status}`,
    "",
    "## Boundary",
    "",
    "- This report is local-only and output-only.",
    "- This report command performs no Cloud SQL connection, psql command, Terraform action, gcloud mutation or credential lookup.",
    "- Existing apply and live-execution evidence is read from DEV-046 output files only.",
    "- This command does not approve or execute migration, runtime smoke or principal mapping.",
    "",
    "## Existing Staging Pattern",
    "",
    `- Cloud Run service present: ${report.servicePattern.cloudRunServicePresent}`,
    `- Service default URL disabled: ${report.servicePattern.defaultUrlDisabled}`,
    `- Service uses private-IP Cloud SQL proxy: ${report.servicePattern.cloudSqlProxyPrivateIamPresent}`,
    `- Service has VPC access: ${report.servicePattern.vpcAccessPresent}`,
    `- Runtime and migration identities separate: ${report.identity.runtimeAndMigrationSeparated}`,
    "",
    "## Runner Gap",
    "",
    `- Cloud Run Job IaC present: ${report.terraformRunnerIac.cloudRunJobPresent}`,
    `- Cloud Run Job apply evidence verified: ${report.terraformRunnerIac.cloudRunJobApplyVerified}`,
    `- Cloud Run Job execution requested: ${report.terraformRunnerIac.cloudRunJobExecutionRequested}`,
    `- Migration service account used by runner: ${report.terraformRunnerIac.runnerUsesMigrationServiceAccount}`,
    `- Cloud SQL proxy pattern used by runner: ${report.terraformRunnerIac.runnerHasCloudSqlProxyPattern}`,
    `- Runner defaults disabled in tfvars example: ${report.terraformRunnerIac.defaultDisabledInTfvarsExample}`,
    `- Runner live apply approval env absent: ${report.terraformRunnerIac.runnerLiveApprovalEnvAbsent}`,
    `- Runtime image copies migration assets: ${report.runtimeImage.copiesMigrationAssets}`,
    `- Runtime image command is web server only: ${report.runtimeImage.webServerCommandOnly}`,
    `- Application migration executor present: ${report.applicationMigrationExecutor.present}`,
    "",
    "## Migration Package Input",
    "",
    `- Manifest present: ${report.migrationPackage.manifestPresent}`,
    `- Manifest status: ${report.migrationPackage.status}`,
    `- Ordered schema migrations: ${report.migrationPackage.orderedSchemaMigrationCount}`,
    `- Live apply allowed by manifest: ${report.migrationPackage.liveApplyAllowed}`,
    "",
    "## Current Blockers",
    ""
  ];

  for (const blocker of report.readiness.blockers) lines.push(`- ${blocker}`);

  lines.push("", "## Required Next Work", "");
  for (const item of report.requiredNextWork) lines.push(`- ${item}`);

  lines.push("", "## Notes", "");
  for (const note of report.notes) lines.push(`- ${note}`);

  return `${lines.join("\n")}\n`;
}

export function buildDev046CloudSqlMigrationRunnerPackage() {
  const manifest = json("config/platform/staging-preflight.template.json");
  const dockerfile = read("Dockerfile");
  const runtimeTf = read("infra/google-cloud/staging/runtime.tf");
  const runnerTf = readIfExists("infra/google-cloud/staging/migration-runner.tf");
  const servicesIamTf = read("infra/google-cloud/staging/services-iam.tf");
  const databaseTf = read("infra/google-cloud/staging/database.tf");
  const localsTf = read("infra/google-cloud/staging/locals.tf");
  const tfvarsExample = read("infra/google-cloud/staging/terraform.tfvars.example");
  const allStagingTf = fs.readdirSync(projectPath("infra/google-cloud/staging"))
    .filter((name) => name.endsWith(".tf"))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => read(`infra/google-cloud/staging/${name}`))
    .join("\n");
  const packageJson = read("package.json");
  const singletonMigrationRunner = read("src/lib/singleton-migration-runner.ts");
  const migrationManifest = jsonIfExists(migrationPackageManifestPath);
  const applySummary = jsonIfExists(migrationRunnerApplySummaryPath);
  const liveExecutionEvidence = jsonIfExists(liveExecutionEvidencePath);
  const runnerPreflight = manifest.phase2Bootstrap?.cloudSqlMigrationRunnerPreflight ?? {};

  const copiesScripts = /\bCOPY\b[^\n]*\bscripts\b/iu.test(dockerfile);
  const copiesInfra = /\bCOPY\b[^\n]*\binfra\b/iu.test(dockerfile);
  const copiesSourceLib = /\bCOPY\b[^\n]*\bsrc\/lib\b/iu.test(dockerfile);
  const copiesOutputMigrationPackage = /output\/dev-046-cloudsql-migration-package/iu.test(dockerfile);
  const migrationCommandPresent = /cloudsql.*migration.*(?:apply|run)|run.*cloudsql.*migration|pdm_schema_migrations/iu.test(packageJson);
  const cloudRunJobPresent = hasTerraformResource(allStagingTf, "google_cloud_run_v2_job");
  const runnerUsesMigrationServiceAccount =
    cloudRunJobPresent && /google_service_account\.migration\[0\]\.email/iu.test(runnerTf);
  const runnerHasCloudSqlProxyPattern =
    cloudRunJobPresent &&
    /cloud-sql-proxy/iu.test(runnerTf) &&
    /--private-ip/iu.test(runnerTf) &&
    /--auto-iam-authn/iu.test(runnerTf);
  const runnerReviewGuardPresent =
    localsTf.includes("migration_runner_job_guard") &&
    localsTf.includes("DEV-046-STAGING-MIGRATION-RUNNER-JOB-REVIEWED") &&
    runnerTf.includes("local.create_resources && local.migration_runner_job_ready ? 1 : 0");
  const runnerDryRunOnly =
    cloudRunJobPresent &&
    runnerTf.includes('"scripts/run-dev-046-cloudsql-migrations.mjs"') &&
    runnerTf.includes('"--dry-run"') &&
    !runnerTf.includes('"--execute"');
  const runnerLiveApprovalEnvAbsent =
    !runnerTf.includes("DEV046_CLOUDSQL_MIGRATION_APPROVAL") &&
    !runnerTf.includes("DEV046_CLOUDSQL_ADMIN_BOOTSTRAP_CONFIRMED");
  const defaultDisabledInTfvarsExample =
    /enable_migration_runner_job\s*=\s*false/u.test(tfvarsExample) &&
    /migration_runner_job_acknowledgement\s*=\s*""/u.test(tfvarsExample);
  const cloudRunJobApplyExecuted = runnerPreflight.cloudRunJobApplyExecuted === true;
  const cloudRunJobApplyVerified =
    cloudRunJobApplyExecuted &&
    applySummary?.result === "apply_verified_job_created_not_executed" &&
    applySummary?.executionBoundary?.terraformApplyExecuted === true &&
    applySummary?.executionBoundary?.terraformAppliedReviewedPlanOnly === true &&
    applySummary?.executionBoundary?.cloudRunJobCreated === true &&
    applySummary?.executionBoundary?.cloudRunJobExecutionReadbackPerformed === true &&
    applySummary?.executionBoundary?.cloudRunJobExecutionCountObserved === 0 &&
    applySummary?.apply?.resourcesAdded === 1 &&
    applySummary?.apply?.resourcesChanged === 0 &&
    applySummary?.apply?.resourcesDestroyed === 0;
  const cloudRunJobExecutionRequested =
    runnerPreflight.cloudRunJobExecutionRequested === true ||
    applySummary?.executionBoundary?.cloudRunJobExecuted === true ||
    Number(applySummary?.executionBoundary?.cloudRunJobExecutionCountObserved ?? 0) > 0;
  const cloudRunJobExecuted =
    runnerPreflight.cloudRunJobExecuted === true ||
    applySummary?.executionBoundary?.cloudRunJobExecuted === true;
  const liveExecutionApproved =
    liveExecutionEvidence?.approvalBoundary?.adminBootstrapApproved === true &&
    liveExecutionEvidence?.approvalBoundary?.liveMigrationApproved === true;
  const liveMigrationEvidencePassed =
    liveExecutionApproved &&
    liveExecutionEvidence?.adminBootstrap?.status === "succeeded" &&
    liveExecutionEvidence?.migrationResult?.status === "succeeded" &&
    liveExecutionEvidence?.migrationResult?.idempotenceVerified === true;
  const runtimeSmokeExecuted = manifest.phase2Bootstrap?.runtimeSmoke?.status === "passed";
  const currentAcceptanceBlockers = Array.isArray(manifest.knownApplicationBlockers)
    ? manifest.knownApplicationBlockers
    : [];
  const applicationMigrationExecutorPresent =
    exists("scripts/apply-dev-046-cloudsql-migrations.mjs") ||
    exists("scripts/run-dev-046-cloudsql-migrations.mjs") ||
    /\bcloudsql:migration:(?:apply|run)\b/iu.test(packageJson);

  const runtimeImage = {
    dockerfileSha256: sha256(dockerfile),
    copiesNextStandalone: /COPY --from=builder[^\n]+\/app\/\.next\/standalone/iu.test(dockerfile),
    copiesNextStatic: /COPY --from=builder[^\n]+\/app\/\.next\/static/iu.test(dockerfile),
    copiesScripts,
    copiesInfra,
    copiesSourceLib,
    copiesOutputMigrationPackage,
    copiesMigrationAssets: copiesScripts && copiesInfra && copiesSourceLib,
    webServerCommandOnly: /CMD\s+\["node",\s*"server\.js"\]/iu.test(dockerfile),
    migrationCapable: copiesScripts && copiesInfra && copiesSourceLib && migrationCommandPresent
  };

  const migrationPackage = {
    manifestPath: migrationPackageManifestPath,
    manifestPresent: Boolean(migrationManifest),
    manifestSha256: migrationManifest ? sha256(JSON.stringify(migrationManifest, null, 2)) : "",
    status: migrationManifest?.status ?? "missing",
    packageVersion: migrationManifest?.packageVersion ?? "",
    orderedSchemaMigrationCount: migrationManifest?.orderedSchemaMigrations?.length ?? 0,
    supportFileCount: migrationManifest?.supportFiles?.length ?? 0,
    excludedFileCount: migrationManifest?.excludedFiles?.length ?? 0,
    liveApplyAllowed: migrationManifest?.executionBoundary?.liveApplyAllowed === true,
    requiresVpcAttachedRunner: migrationManifest?.executionBoundary?.requiresVpcAttachedRunner === true,
    requiresReviewedAdminBootstrap: migrationManifest?.executionBoundary?.requiresReviewedAdminBootstrap === true
  };
  const evidenceManifestSha256 = liveExecutionEvidence?.migrationResult?.manifestSha256 ?? null;
  const evidenceSchemaMigrationCount = liveExecutionEvidence?.migrationResult?.schemaMigrationCount ?? null;
  const liveMigrationEvidenceMatchesCurrentPackage =
    evidenceManifestSha256 === migrationPackage.manifestSha256 &&
    evidenceSchemaMigrationCount === migrationPackage.orderedSchemaMigrationCount;
  const liveMigrationCompleted = liveMigrationEvidencePassed && liveMigrationEvidenceMatchesCurrentPackage;
  const runtimeSmokeBoundToCurrentPackage = liveMigrationCompleted && runtimeSmokeExecuted;

  const blockers = [];
  if (!migrationPackage.manifestPresent) blockers.push("STAGING_CLOUD_SQL_MIGRATION_PACKAGE_MANIFEST_MISSING");
  if (migrationPackage.liveApplyAllowed) blockers.push("STAGING_CLOUD_SQL_MIGRATION_PACKAGE_UNEXPECTEDLY_ALLOWS_LIVE_APPLY");
  if (!runtimeImage.migrationCapable) blockers.push("STAGING_MIGRATION_RUNNER_IMAGE_NOT_PACKAGED");
  if (!cloudRunJobPresent) blockers.push("STAGING_CLOUD_RUN_JOB_IAC_NOT_PRESENT");
  if (cloudRunJobPresent && !cloudRunJobApplyExecuted) blockers.push("STAGING_CLOUD_RUN_JOB_APPLY_NOT_EXECUTED");
  if (cloudRunJobPresent && cloudRunJobApplyExecuted && !cloudRunJobApplyVerified) blockers.push("STAGING_CLOUD_RUN_JOB_APPLY_EVIDENCE_MISSING");
  if (cloudRunJobPresent && cloudRunJobExecutionRequested && !liveExecutionApproved) blockers.push("STAGING_CLOUD_RUN_JOB_EXECUTION_UNAPPROVED");
  if (cloudRunJobPresent && !runnerUsesMigrationServiceAccount) blockers.push("STAGING_CLOUD_RUN_JOB_NOT_USING_MIGRATION_IDENTITY");
  if (cloudRunJobPresent && !runnerHasCloudSqlProxyPattern) blockers.push("STAGING_CLOUD_RUN_JOB_MISSING_PRIVATE_IAM_PROXY_PATTERN");
  if (cloudRunJobPresent && !runnerReviewGuardPresent) blockers.push("STAGING_CLOUD_RUN_JOB_REVIEW_GUARD_MISSING");
  if (cloudRunJobPresent && !runnerDryRunOnly) blockers.push("STAGING_CLOUD_RUN_JOB_NOT_DRY_RUN_ONLY");
  if (cloudRunJobPresent && !runnerLiveApprovalEnvAbsent) blockers.push("STAGING_CLOUD_RUN_JOB_CONTAINS_LIVE_APPROVAL_ENV");
  if (cloudRunJobPresent && !defaultDisabledInTfvarsExample) blockers.push("STAGING_CLOUD_RUN_JOB_DEFAULT_NOT_DISABLED");
  if (!applicationMigrationExecutorPresent) blockers.push("STAGING_MIGRATION_RUNNER_EXECUTOR_NOT_IMPLEMENTED");
  if (liveMigrationEvidencePassed && !liveMigrationEvidenceMatchesCurrentPackage) {
    blockers.push("STAGING_LIVE_MIGRATION_EVIDENCE_PACKAGE_MISMATCH");
  }
  if (runtimeSmokeBoundToCurrentPackage) blockers.push(...currentAcceptanceBlockers);
  else if (liveMigrationCompleted) blockers.push("STAGING_RUNTIME_SMOKE_NOT_EXECUTED");
  else if (!liveMigrationEvidencePassed) blockers.push("STAGING_ADMIN_BOOTSTRAP_PATH_NOT_APPROVED");
  const requiredNextWork = runtimeSmokeBoundToCurrentPackage
    ? [
        "Create or verify the staging principal mapping after a real provider UID exists.",
        "Resolve the deployed application artifact provenance and source drift before full staging acceptance."
      ]
    : liveMigrationCompleted
    ? [
        "Provision or approve a browser-accessible internal HTTPS entrypoint.",
        "Run least-privilege runtime smoke through the Cloud Run runtime service account.",
        "Only after runtime smoke succeeds, create or verify staging principal mappings."
      ]
    : ["Review the proposal-only Cloud SQL migration manifest and candidate SQL before any live apply."];
  if (!runtimeImage.migrationCapable) {
    requiredNextWork.push("Add a migration-capable one-shot runner package or image that includes the reviewed manifest/SQL and an explicit executor command.");
  }
  if (!cloudRunJobPresent) {
    requiredNextWork.push("Add reviewed Cloud Run Job or equivalent VPC-attached runner IaC using the migration service account and private Cloud SQL IAM proxy pattern.");
  } else if (!cloudRunJobApplyExecuted) {
    requiredNextWork.push("Review the Cloud Run Job IaC, build and push a digest-pinned migration-runner image, then request separate approval before any Terraform plan/apply.");
  } else if (!liveMigrationCompleted) {
    requiredNextWork.push("Keep the created Cloud Run Job unexecuted until admin bootstrap and live migration approvals are separately granted.");
  }
  if (!applicationMigrationExecutorPresent) {
    requiredNextWork.push("Add an explicit migration executor command that defaults to dry-run and requires live approval before connecting.");
  }
  if (!liveMigrationCompleted) {
    requiredNextWork.push(
      "Approve a separate admin bootstrap path before role/grant bootstrap SQL is executed.",
      "Only after runner review, execute staging migration, runtime smoke and principal mapping evidence in order."
    );
  }

  return {
    schemaVersion: 1,
    reportType: "dev-046-cloudsql-migration-runner-package-preflight",
    dev: "DEV-046",
    phase: "Phase-2B-staging-migration-runner-preflight",
    packageVersion: DEV046_CLOUDSQL_MIGRATION_RUNNER_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    target: {
      projectId: manifest.target.stagingProjectId,
      region: manifest.target.region,
      cloudSqlInstance: manifest.phase2Bootstrap?.cloudSql?.instance ?? "",
      connectionName: manifest.phase2Bootstrap?.cloudSql?.connectionName ?? "",
      databaseName: "ai_pdm",
      privateIpOnly: true,
      privateIpObserved: manifest.phase2Bootstrap?.cloudSql?.privateIp ?? ""
    },
    executionBoundary: {
      localOnly: true,
      outputOnly: true,
      noCredentialLookupPerformed: true,
      noCloudSqlConnectionAttempted: true,
      noSqlApplied: true,
      noTerraformAction: true,
      noGcloudMutation: true,
      noPsqlCommand: true,
      noCloudRunJobActionPerformedByThisCommand: true,
      cloudRunJobCreatedByReviewedApply: cloudRunJobApplyVerified,
      noCloudRunJobExecution: !cloudRunJobExecuted,
      liveExecutionAllowed: false
    },
    liveExecutionEvidence: {
      path: liveExecutionEvidencePath,
      present: liveExecutionEvidence !== null,
      status: liveExecutionEvidence?.status ?? "not-present",
      approved: liveExecutionApproved,
      evidenceManifestSha256,
      currentManifestSha256: migrationPackage.manifestSha256,
      evidenceSchemaMigrationCount,
      currentSchemaMigrationCount: migrationPackage.orderedSchemaMigrationCount,
      matchesCurrentPackage: liveMigrationEvidenceMatchesCurrentPackage,
      liveMigrationCompleted,
      idempotenceVerified: liveExecutionEvidence?.migrationResult?.idempotenceVerified === true,
      jobRestoredToDryRun: liveExecutionEvidence?.postExecutionJobPosture?.restoredToDryRun === true,
      runtimeSmokeExecuted,
      runtimeSmokeBoundToCurrentPackage
    },
    migrationPackage,
    servicePattern: {
      runtimeTfSha256: sha256(runtimeTf),
      cloudRunServicePresent: hasTerraformResource(runtimeTf, "google_cloud_run_v2_service"),
      defaultUrlPolicyConditional:
        runtimeTf.includes("default_uri_disabled = !var.enable_firebase_hosting_gateway"),
      ingressPolicyConditional:
        runtimeTf.includes("var.enable_firebase_hosting_gateway") &&
        runtimeTf.includes('"INGRESS_TRAFFIC_ALL"') &&
        runtimeTf.includes('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"'),
      firebaseHostingGatewayEnabledInTfvarsExample:
        read("infra/google-cloud/staging/terraform.tfvars.example").includes("enable_firebase_hosting_gateway = true"),
      vpcAccessPresent: runtimeTf.includes("vpc_access") && runtimeTf.includes("network_interfaces"),
      cloudSqlProxyPrivateIamPresent:
        runtimeTf.includes('name  = "cloud-sql-proxy"') &&
        runtimeTf.includes("--private-ip") &&
        runtimeTf.includes("--auto-iam-authn") &&
        runtimeTf.includes("--lazy-refresh")
    },
    identity: {
      servicesIamSha256: sha256(servicesIamTf),
      databaseTfSha256: sha256(databaseTf),
      runtimeServiceAccountPresent: servicesIamTf.includes('account_id   = "pdm-runtime-stg"'),
      migrationServiceAccountPresent: servicesIamTf.includes('account_id   = "pdm-migration-stg"'),
      runtimeIamDbUserPresent: databaseTf.includes('resource "google_sql_user" "runtime_iam"'),
      migrationIamDbUserPresent: databaseTf.includes('resource "google_sql_user" "migration_iam"'),
      runtimeAndMigrationSeparated:
        servicesIamTf.includes('account_id   = "pdm-runtime-stg"') &&
        servicesIamTf.includes('account_id   = "pdm-migration-stg"') &&
        databaseTf.includes('resource "google_sql_user" "runtime_iam"') &&
        databaseTf.includes('resource "google_sql_user" "migration_iam"')
    },
    terraformRunnerIac: {
      runnerTfSha256: runnerTf ? sha256(runnerTf) : "",
      cloudRunJobPresent,
      cloudRunJobApplyExecuted,
      cloudRunJobApplyVerified,
      cloudRunJobApplySummaryPath: migrationRunnerApplySummaryPath,
      cloudRunJobExecutionRequested,
      cloudRunJobExecuted,
      runnerUsesMigrationServiceAccount,
      runnerHasCloudSqlProxyPattern,
      runnerReviewGuardPresent,
      runnerDryRunOnly,
      runnerLiveApprovalEnvAbsent,
      defaultDisabledInTfvarsExample,
      reviewedOnly: true,
      liveApplyAllowed: false
    },
    runtimeImage,
    applicationMigrationExecutor: {
      present: applicationMigrationExecutorPresent,
      singletonPrimitivePresent:
        singletonMigrationRunner.includes("runSingletonMigrations") &&
        singletonMigrationRunner.includes("pg_try_advisory_xact_lock"),
      singletonPrimitiveIsLibraryOnly: !applicationMigrationExecutorPresent
    },
    readiness: {
      status: runtimeSmokeBoundToCurrentPackage
        ? "live_migration_and_runtime_smoke_completed_acceptance_gated"
        : liveMigrationCompleted
          ? "live_migration_completed_runtime_smoke_pending"
        : blockers.length === 1 && blockers[0] === "STAGING_ADMIN_BOOTSTRAP_PATH_NOT_APPROVED"
          ? "blocked_admin_bootstrap_not_approved"
        : blockers.length === 0
          ? "runner_ready_for_admin_bootstrap_review"
          : "blocked_runner_not_ready",
      readyForLiveMigration: false,
      liveMigrationCompleted,
      topLevelBlockerCoveredBy: runtimeSmokeBoundToCurrentPackage
        ? null
        : liveMigrationEvidencePassed && !liveMigrationEvidenceMatchesCurrentPackage
          ? "STAGING_LIVE_MIGRATION_EVIDENCE_PACKAGE_MISMATCH"
        : liveMigrationCompleted
          ? "STAGING_RUNTIME_SMOKE_NOT_EXECUTED"
          : "STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY",
      blockers
    },
    requiredNextWork,
    notes: runtimeSmokeBoundToCurrentPackage
      ? [
          "The existing web Cloud Run service image remains separate from the migration runner.",
          `Admin bootstrap and all ${migrationPackage.orderedSchemaMigrationCount} intended migrations completed for the exact manifest; the immediate second run applied zero versions.`,
          "The Cloud Run Job was restored to dry-run posture and contains no live approval environment values.",
          "Runtime Cloud SQL smoke passed; remaining staging blockers are principal mapping and application artifact provenance."
        ]
      : liveMigrationCompleted
      ? [
          "The existing web Cloud Run service image remains separate from the migration runner.",
          `Admin bootstrap and all ${migrationPackage.orderedSchemaMigrationCount} intended migrations completed for the exact manifest; the immediate second run applied zero versions.`,
          "The Cloud Run Job was restored to dry-run posture and contains no live approval environment values.",
          "Runtime smoke and principal mapping remain separate unexecuted gates."
        ]
      : [
          "The existing web Cloud Run service image is intentionally web-runtime focused and should not be treated as a migration runner.",
          "This runner preflight is a child gate under STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY; it does not add a fifth top-level live blocker.",
          "The Cloud Run Job has been created from the reviewed saved plan, but has not been executed.",
          "Private-IP-only Cloud SQL makes direct local apply inappropriate unless an approved VPC-attached execution path exists."
        ]
  };
}

export async function writeDev046CloudSqlMigrationRunnerPackage(report, outputDir = defaultOutputDir) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "report.json");
  const markdownPath = path.join(outputDir, "report.md");
  const contractPath = path.join(outputDir, "migration-runner-contract.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  await writeFile(contractPath, buildRunnerContractMarkdown(report), "utf8");
  return { jsonPath, markdownPath, contractPath };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const report = buildDev046CloudSqlMigrationRunnerPackage();
  if (args.has("--write-report")) await writeDev046CloudSqlMigrationRunnerPackage(report);
  console.log(`DEV-046 Cloud SQL migration runner preflight: ${report.readiness.status}`);
  console.log(`Migration package manifest present: ${report.migrationPackage.manifestPresent}`);
  console.log(`Cloud Run Job IaC present: ${report.terraformRunnerIac.cloudRunJobPresent}`);
  console.log(`Migration-capable image present: ${report.runtimeImage.migrationCapable}`);
  for (const blocker of report.readiness.blockers) console.log(`BLOCKED ${blocker}`);
  console.log("No credentials were read and no Terraform, gcloud, psql, Cloud SQL or Cloud Run Job action ran.");
  if (args.has("--require-ready") && report.readiness.readyForLiveMigration !== true) process.exitCode = 1;
}
