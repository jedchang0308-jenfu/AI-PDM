#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_FORMAL_REVIEW_PACKAGE_VERSION,
  buildStorageSchemaFormalReviewPackage,
  writeStorageSchemaFormalReviewPackage
} from "./generate-file-storage-schema-formal-review-package.mjs";
import { buildStorageSchemaTargetReadinessPackage } from "./generate-file-storage-schema-target-readiness-package.mjs";
import { buildStorageSchemaTargetCostConfirmationPackage } from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";
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

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function projectInventory() {
  return {
    projects: [
      {
        name: "AI_PDM_STAGING",
        ref: "aipdmstagingref",
        region: "ap-southeast-1",
        status: "ACTIVE",
        host: "db.aipdmstagingref.supabase.co"
      }
    ]
  };
}

function blockedTargetReadinessPackage() {
  return {
    reportType: "file-storage-schema-target-readiness-package",
    assumptions: {
      noDatabaseConnection: true,
      noSupabaseProjectCreated: true
    },
    inputs: {
      expectedTargetName: "ProJED_TEST"
    },
    readiness: {
      readyForSchemaApplyGate: false
    },
    summary: {
      status: "blocked_target_readiness"
    }
  };
}

function userCostConfirmationEvidence() {
  return {
    reportType: "supabase-target-user-cost-confirmation-evidence",
    targetName: "AI_PDM_STAGING",
    resourceType: "project",
    confirmationRecorded: true,
    cost: {
      amount: 0,
      recurrence: "monthly"
    }
  };
}

function readyPromotionReport() {
  return {
    reportType: "file-storage-schema-promotion-gate",
    assumptions: {
      noSqlApplied: true,
      noOfficialMigrationFilesWritten: true
    },
    readiness: {
      readyForFormalMigrationReview: true
    },
    summary: {
      status: "ready_for_formal_migration_review"
    }
  };
}

function readyTargetCreateResultEvidence() {
  return {
    reportType: "supabase-target-create-result-evidence",
    assumptions: {
      noDatabaseConnection: true,
      noSqlApplied: true
    },
    target: {
      targetName: "AI_PDM_STAGING"
    },
    summary: {
      status: "target_created_inventory_verified",
      verifiedTargetCount: 1
    }
  };
}

function blockedTargetCreateResultEvidence() {
  return {
    ...readyTargetCreateResultEvidence(),
    summary: {
      status: "blocked_create_request_not_ready",
      verifiedTargetCount: 0
    }
  };
}

function blockedPromotionReport() {
  return {
    ...readyPromotionReport(),
    readiness: {
      readyForFormalMigrationReview: false
    },
    summary: {
      status: "blocked_failed_evidence"
    }
  };
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schema-formal-review-qc-"));
  const inventoryPath = path.join(tempRoot, "projects.json");
  await writeJson(inventoryPath, projectInventory());

  const readyTargetPackage = await buildStorageSchemaTargetReadinessPackage({
    projectsReportPath: inventoryPath,
    expectedTargetName: "AI_PDM_STAGING"
  });
  const readyCostPackage = buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    organizationName: "JED",
    targetName: "AI_PDM_STAGING",
    region: "ap-southeast-1",
    preferredResource: "project",
    projectCostAmount: 0,
    projectCostRecurrence: "monthly",
    branchCostAmount: 0.01344,
    branchCostRecurrence: "hourly"
  });

  const targetPackagePath = path.join(tempRoot, "storage-schema-target-readiness-package.json");
  const costPackagePath = path.join(tempRoot, "storage-schema-target-cost-confirmation-package.json");
  const userCostPath = path.join(tempRoot, "user-cost-confirmation.json");
  const targetCreateResultPath = path.join(tempRoot, "supabase-target-create-result-evidence.json");
  const promotionPath = path.join(tempRoot, "storage-schema-promotion-gate.json");
  await writeJson(targetPackagePath, readyTargetPackage);
  await writeJson(costPackagePath, readyCostPackage);
  await writeJson(userCostPath, userCostConfirmationEvidence());
  await writeJson(targetCreateResultPath, readyTargetCreateResultEvidence());
  await writeJson(promotionPath, readyPromotionReport());

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-formal-review-package.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const missingReport = await buildStorageSchemaFormalReviewPackage({});
  record("STORAGE-SCHEMA-FORMAL-REVIEW-001 package version is stable", missingReport.packageVersion === STORAGE_SCHEMA_FORMAL_REVIEW_PACKAGE_VERSION);
  record("STORAGE-SCHEMA-FORMAL-REVIEW-002 missing evidence blocks review", missingReport.summary.status === "blocked_missing_evidence");
  record("STORAGE-SCHEMA-FORMAL-REVIEW-003 missing evidence is not ready", missingReport.readiness.readyForFormalMigrationReview === false);

  const blockedTargetPath = path.join(tempRoot, "blocked-target.json");
  await writeJson(blockedTargetPath, blockedTargetReadinessPackage());
  const blockedTargetReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: blockedTargetPath,
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userCostPath,
    targetCreateResultEvidencePath: targetCreateResultPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-004 blocked target readiness blocks package", blockedTargetReport.summary.status === "blocked_target_readiness");

  const missingUserConfirmationReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: costPackagePath,
    targetCreateResultEvidencePath: targetCreateResultPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-005 missing user cost confirmation blocks package", missingUserConfirmationReport.summary.status === "blocked_cost_confirmation");

  const badCostPath = path.join(tempRoot, "bad-cost.json");
  await writeJson(badCostPath, buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    targetName: "AI_PDM_STAGING",
    preferredResource: "branch"
  }));
  const blockedCostReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: badCostPath,
    userCostConfirmedEvidencePath: userCostPath,
    targetCreateResultEvidencePath: targetCreateResultPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-006 incomplete cost evidence blocks package", blockedCostReport.summary.status === "blocked_cost_confirmation");

  const missingTargetCreateResultReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userCostPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-007 missing target create result blocks package", missingTargetCreateResultReport.summary.status === "blocked_missing_evidence");

  const blockedTargetCreateResultPath = path.join(tempRoot, "blocked-target-create-result.json");
  await writeJson(blockedTargetCreateResultPath, blockedTargetCreateResultEvidence());
  const blockedTargetCreateResultReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userCostPath,
    targetCreateResultEvidencePath: blockedTargetCreateResultPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-008 blocked target create result blocks package", blockedTargetCreateResultReport.summary.status === "blocked_target_provisioning_result");

  const blockedPromotionPath = path.join(tempRoot, "blocked-promotion.json");
  await writeJson(blockedPromotionPath, blockedPromotionReport());
  const blockedPromotionGateReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userCostPath,
    targetCreateResultEvidencePath: targetCreateResultPath,
    promotionReportPath: blockedPromotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-009 blocked promotion gate blocks package", blockedPromotionGateReport.summary.status === "blocked_schema_promotion");

  const readyReport = await buildStorageSchemaFormalReviewPackage({
    targetReadinessPackagePath: targetPackagePath,
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userCostPath,
    targetCreateResultEvidencePath: targetCreateResultPath,
    promotionReportPath: promotionPath
  });
  record("STORAGE-SCHEMA-FORMAL-REVIEW-010 clean evidence is ready for formal review", readyReport.summary.status === "ready_for_formal_migration_review");
  record("STORAGE-SCHEMA-FORMAL-REVIEW-011 ready report has no blockers", readyReport.summary.blockerCount === 0 && readyReport.blockers.length === 0);
  record("STORAGE-SCHEMA-FORMAL-REVIEW-012 ready report records all source statuses", readyReport.sourceEvidence.targetReadiness.status === "ready_for_schema_apply_handoff" && readyReport.sourceEvidence.costConfirmation.status === "ready_for_user_cost_confirmation" && readyReport.sourceEvidence.userCostConfirmation.status === "confirmed" && readyReport.sourceEvidence.targetCreateResult.status === "target_created_inventory_verified" && readyReport.sourceEvidence.schemaPromotion.status === "ready_for_formal_migration_review");
  record("STORAGE-SCHEMA-FORMAL-REVIEW-013 formal package is evidence-only", readyReport.assumptions.noDatabaseConnection === true && readyReport.assumptions.noSqlApplied === true && readyReport.assumptions.noSupabaseResourceCreated === true);

  const outputs = await writeStorageSchemaFormalReviewPackage(readyReport, tempRoot);
  record("STORAGE-SCHEMA-FORMAL-REVIEW-014 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-FORMAL-REVIEW-015 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-FORMAL-REVIEW-016 package scripts are registered",
    packageJson.includes('"storage:schema-formal-review-package"') &&
      packageJson.includes('"qc:file-storage-schema-formal-review-package"')
  );
  record(
    "STORAGE-SCHEMA-FORMAL-REVIEW-017 PM evidence references formal review lane",
    planSource.includes("Phase 5H") &&
      planSource.includes("storage:schema-formal-review-package") &&
      planSource.includes("qc:file-storage-schema-formal-review-package") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-FORMAL-REVIEW-018 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );
  record(
    "STORAGE-SCHEMA-FORMAL-REVIEW-019 generator does not call Supabase resource APIs",
    !generatorSource.includes("_create_project") &&
      !generatorSource.includes("_create_branch") &&
      !generatorSource.includes("_confirm_cost") &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, blockedTargetReport, missingUserConfirmationReport, blockedCostReport, missingTargetCreateResultReport, blockedTargetCreateResultReport, blockedPromotionGateReport, readyReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-FORMAL-REVIEW-020 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
