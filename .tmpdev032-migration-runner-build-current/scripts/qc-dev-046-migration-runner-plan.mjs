#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

try {
  const summary = json("output/dev-046-migration-runner-plan/plan-summary.json");
  const digest = read("output/dev-046-migration-runner-plan/image-digest.txt").trim();
  const tfvars = read("output/dev-046-migration-runner-plan/migration-runner-plan.tfvars");
  const planLog = read("output/dev-046-migration-runner-plan/terraform-plan.log");
  const plainPlanLog = planLog.replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, "");
  const applySummary = exists("output/dev-046-migration-runner-plan/apply-summary.json")
    ? json("output/dev-046-migration-runner-plan/apply-summary.json")
    : null;
  const applyLog = exists("output/dev-046-migration-runner-plan/terraform-apply.log")
    ? read("output/dev-046-migration-runner-plan/terraform-apply.log")
    : "";
  const executionsReadback = exists("output/dev-046-migration-runner-plan/cloud-run-job-executions.json")
    ? read("output/dev-046-migration-runner-plan/cloud-run-job-executions.json")
    : "";
  const dockerfile = read("Dockerfile");
  const dockerignore = read(".dockerignore");

  record(
    "DEV046-MIG-RUNNER-PLAN-001 plan review result is pass-but-apply-not-authorized",
    summary.result === "plan_review_passed_apply_not_authorized" &&
      summary.executionBoundary.terraformPlanOnly === true &&
      summary.executionBoundary.terraformApplyExecuted === false &&
      summary.executionBoundary.adminBootstrapExecuted === false &&
      summary.executionBoundary.liveMigrationExecuted === false &&
      summary.executionBoundary.cloudRunJobExecuted === false
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-002 pushed artifact is digest-pinned and used by plan",
    /^asia-east1-docker\.pkg\.dev\/jenfu-ai-pdm-stg-361825\/ai-pdm\/ai-pdm-migration@sha256:[a-f0-9]{64}$/u.test(digest) &&
      summary.artifact.digest === digest &&
      summary.job.mainImage === digest &&
      summary.acceptance.digestMatchesPushedArtifact === true
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-003 plan has exactly one actionable create and no update/delete/replace",
    summary.plan.actionableChangeCount === 1 &&
      summary.plan.creates === 1 &&
      summary.plan.updates === 0 &&
      summary.plan.deletes === 0 &&
      summary.plan.replaces === 0 &&
      summary.plan.actionableSummary?.[0]?.address === "google_cloud_run_v2_job.migration_runner[0]" &&
      plainPlanLog.includes("Plan: 1 to add, 0 to change, 0 to destroy.")
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-004 job shape is migration identity plus private IAM proxy",
    summary.job.name === "ai-pdm-stg-migration-runner" &&
      summary.job.project === "jenfu-ai-pdm-stg-361825" &&
      summary.job.location === "asia-east1" &&
      summary.job.deletionProtection === true &&
      summary.job.serviceAccount === "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam.gserviceaccount.com" &&
      summary.job.proxyArgs.includes("--private-ip") &&
      summary.job.proxyArgs.includes("--auto-iam-authn") &&
      summary.acceptance.migrationServiceAccount === true &&
      summary.acceptance.privateIamProxy === true
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-005 job remains dry-run only",
    summary.job.mainCommand.includes("node") &&
      summary.job.mainArgs.includes("scripts/run-dev-046-cloudsql-migrations.mjs") &&
      summary.job.mainArgs.includes("--dry-run") &&
      !summary.job.mainArgs.includes("--execute") &&
      summary.job.mainContainsLiveApprovalEnv === false &&
      summary.acceptance.dryRunOnly === true &&
      summary.acceptance.noLiveApprovalEnvInJob === true
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-006 plan tfvars used explicit reviewed gates",
    tfvars.includes("enable_migration_runner_job = true") &&
      tfvars.includes('migration_runner_job_acknowledgement = "DEV-046-STAGING-MIGRATION-RUNNER-JOB-REVIEWED"') &&
      tfvars.includes('phase2_apply_acknowledgement = "DEV-046-PHASE-2B-APPROVED"') &&
      tfvars.includes(`migration_runner_image = "${digest}"`)
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-007 build context contains needed runner inputs without Terraform state",
    dockerfile.includes("COPY --chown=nextjs:nodejs infra ./infra") &&
      dockerfile.includes("COPY --chown=nextjs:nodejs src/lib ./src/lib") &&
      dockerignore.includes("**/.terraform") &&
      dockerignore.includes("*.tfstate")
  );
  record(
    "DEV046-MIG-RUNNER-PLAN-008 evidence has no common credential markers",
    !/(ya29\.|BEGIN PRIVATE KEY|refresh_token|client_secret|service_account_key|"token"\s*:)/iu.test(
      `${JSON.stringify(summary)}\n${JSON.stringify(applySummary ?? {})}\n${tfvars}\n${planLog}\n${applyLog}\n${executionsReadback}`
    )
  );

  if (applySummary) {
    record(
      "DEV046-MIG-RUNNER-APPLY-009 saved plan apply created exactly one job and no changes/destroys",
      applySummary.result === "apply_verified_job_created_not_executed" &&
        applySummary.executionBoundary.terraformApplyExecuted === true &&
        applySummary.executionBoundary.terraformAppliedReviewedPlanOnly === true &&
        applySummary.apply.planFile === summary.plan.file &&
        applySummary.apply.resourcesAdded === 1 &&
        applySummary.apply.resourcesChanged === 0 &&
        applySummary.apply.resourcesDestroyed === 0 &&
        applySummary.acceptance.applyWasPlanOnlyCreate === true &&
        applyLog.replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, "").includes("Apply complete! Resources: 1 added, 0 changed, 0 destroyed.")
    );
    record(
      "DEV046-MIG-RUNNER-APPLY-010 created job matches reviewed digest and dry-run command",
      applySummary.job.name === summary.job.name &&
        applySummary.job.mainImage === digest &&
        applySummary.job.mainImage === summary.job.mainImage &&
        applySummary.job.mainArgs.includes("scripts/run-dev-046-cloudsql-migrations.mjs") &&
        applySummary.job.mainArgs.includes("--dry-run") &&
        !applySummary.job.mainArgs.includes("--execute") &&
        applySummary.acceptance.imageDigestMatchesPlan === true &&
        applySummary.acceptance.dryRunOnly === true
    );
    record(
      "DEV046-MIG-RUNNER-APPLY-011 created job keeps migration identity and private IAM proxy",
      applySummary.job.serviceAccount === summary.job.serviceAccount &&
        applySummary.acceptance.migrationServiceAccount === true &&
        applySummary.job.proxyArgs.includes("--private-ip") &&
        applySummary.job.proxyArgs.includes("--auto-iam-authn") &&
        applySummary.acceptance.privateIamProxy === true
    );
    record(
      "DEV046-MIG-RUNNER-APPLY-012 apply did not execute job, bootstrap, migration or runtime smoke",
        applySummary.executionBoundary.cloudRunJobExecuted === false &&
        applySummary.executionBoundary.cloudRunJobExecutionReadbackPerformed === true &&
        applySummary.executionBoundary.cloudRunJobExecutionCountObserved === 0 &&
        applySummary.executionBoundary.adminBootstrapExecuted === false &&
        applySummary.executionBoundary.liveMigrationExecuted === false &&
        applySummary.executionBoundary.runtimeSmokeExecuted === false &&
        applySummary.acceptance.noJobExecutionRequested === true &&
        applySummary.acceptance.noJobExecutionObserved === true &&
        executionsReadback.trim() === "[]" &&
        applySummary.acceptance.noLiveApprovalEnvInJob === true &&
        applySummary.job.mainContainsLiveApprovalEnv === false
    );
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
