#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_USER_COST_CONFIRMATION_EVIDENCE_VERSION,
  buildStorageSchemaUserCostConfirmationEvidence,
  writeStorageSchemaUserCostConfirmationEvidence
} from "./generate-file-storage-schema-user-cost-confirmation-evidence.mjs";
import { buildStorageSchemaTargetCostConfirmationPackage } from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";
import { buildStorageSchemaFormalReviewPackage } from "./generate-file-storage-schema-formal-review-package.mjs";
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

function costPackage() {
  return buildStorageSchemaTargetCostConfirmationPackage({
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
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-user-cost-confirmation-qc-"));
  const costPackagePath = path.join(tempRoot, "storage-schema-target-cost-confirmation-package.json");
  const readyCostPackage = costPackage();
  await writeJson(costPackagePath, readyCostPackage);
  const expectedText = readyCostPackage.handoff.confirmationText;

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-user-cost-confirmation-evidence.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const missingReport = await buildStorageSchemaUserCostConfirmationEvidence({});
  record("STORAGE-SCHEMA-USER-COST-001 evidence version is stable", missingReport.evidenceVersion === STORAGE_SCHEMA_USER_COST_CONFIRMATION_EVIDENCE_VERSION);
  record("STORAGE-SCHEMA-USER-COST-002 missing cost package blocks evidence", missingReport.summary.status === "blocked_missing_cost_confirmation_package");
  record("STORAGE-SCHEMA-USER-COST-003 missing package does not record confirmation", missingReport.confirmationRecorded === false);

  const missingConfirmation = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath
  });
  record("STORAGE-SCHEMA-USER-COST-004 missing confirmation text blocks evidence", missingConfirmation.summary.status === "blocked_missing_user_confirmation");

  const staleCostPackagePath = path.join(tempRoot, "stale-storage-schema-target-cost-confirmation-package.json");
  await writeJson(staleCostPackagePath, {
    ...readyCostPackage,
    generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  });
  const staleCostPackageReport = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: staleCostPackagePath,
    confirmationText: expectedText,
    confirmedBy: "user"
  });
  record("STORAGE-SCHEMA-USER-COST-018 stale cost package blocks confirmation evidence", staleCostPackageReport.summary.status === "blocked_stale_cost_confirmation_package");

  const mismatchReport = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath,
    confirmationText: "I confirm something else.",
    confirmedBy: "user"
  });
  record("STORAGE-SCHEMA-USER-COST-005 mismatched confirmation text blocks evidence", mismatchReport.summary.status === "blocked_confirmation_text_mismatch");

  const missingConfirmedBy = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath,
    confirmationText: expectedText
  });
  record("STORAGE-SCHEMA-USER-COST-006 missing confirmed-by blocks evidence", missingConfirmedBy.summary.status === "blocked_missing_confirmed_by");

  const confirmedReport = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath,
    confirmationText: expectedText,
    confirmedBy: "user"
  });
  record("STORAGE-SCHEMA-USER-COST-007 exact confirmation records evidence", confirmedReport.summary.status === "confirmed" && confirmedReport.confirmationRecorded === true);
  record("STORAGE-SCHEMA-USER-COST-008 confirmed evidence matches target and cost", confirmedReport.targetName === "AI_PDM_STAGING" && confirmedReport.resourceType === "project" && confirmedReport.cost.amount === 0 && confirmedReport.cost.recurrence === "monthly");
  record("STORAGE-SCHEMA-USER-COST-009 confirmed evidence is confirm-cost ready but not create-ready", confirmedReport.summary.readyForSupabaseConfirmCost === true && confirmedReport.summary.readyForSupabaseCreateCall === false);
  record("STORAGE-SCHEMA-USER-COST-010 evidence keeps no connector side effects", confirmedReport.assumptions.noSupabaseConfirmCostCalled === true && confirmedReport.assumptions.noSupabaseProjectCreated === true && confirmedReport.assumptions.noSupabaseBranchCreated === true);
  record("STORAGE-SCHEMA-USER-COST-019 confirmed evidence records source cost package freshness", confirmedReport.summary.costPackageFresh === true && confirmedReport.costPackage.generatedAt === readyCostPackage.generatedAt);

  const userEvidencePath = path.join(tempRoot, "user-cost-confirmation-evidence.json");
  await writeJson(userEvidencePath, confirmedReport);
  const formalReport = await buildStorageSchemaFormalReviewPackage({
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userEvidencePath
  });
  record("STORAGE-SCHEMA-USER-COST-011 formal package accepts confirmed user cost evidence", formalReport.sourceEvidence.userCostConfirmation.status === "confirmed");

  const outputs = await writeStorageSchemaUserCostConfirmationEvidence(confirmedReport, tempRoot);
  record("STORAGE-SCHEMA-USER-COST-012 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-USER-COST-013 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-USER-COST-014 package scripts are registered",
    packageJson.includes('"storage:schema-user-cost-confirmation-evidence"') &&
      packageJson.includes('"qc:file-storage-schema-user-cost-confirmation-evidence"')
  );
  record(
    "STORAGE-SCHEMA-USER-COST-015 PM evidence references user cost confirmation lane",
    planSource.includes("Phase 5C") &&
      planSource.includes("storage:schema-user-cost-confirmation-evidence") &&
      planSource.includes("qc:file-storage-schema-user-cost-confirmation-evidence") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-USER-COST-016 generator does not call Supabase resource APIs",
    !generatorSource.includes("_confirm_cost") &&
      !generatorSource.includes("_create_project") &&
      !generatorSource.includes("_create_branch") &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, missingConfirmation, mismatchReport, missingConfirmedBy, confirmedReport, formalReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-USER-COST-017 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
