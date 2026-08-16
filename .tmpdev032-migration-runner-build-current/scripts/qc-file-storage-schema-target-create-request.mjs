#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_CREATE_REQUEST_VERSION,
  buildStorageSchemaTargetCreateRequest,
  writeStorageSchemaTargetCreateRequest
} from "./generate-file-storage-schema-target-create-request.mjs";
import { buildStorageSchemaTargetCostConfirmationPackage } from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";
import { buildStorageSchemaUserCostConfirmationEvidence } from "./generate-file-storage-schema-user-cost-confirmation-evidence.mjs";
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

function costPackage(overrides = {}) {
  return buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    organizationName: "JED",
    targetName: "AI_PDM_STAGING",
    region: "ap-southeast-1",
    preferredResource: "project",
    projectCostAmount: 0,
    projectCostRecurrence: "monthly",
    branchCostAmount: 0.01344,
    branchCostRecurrence: "hourly",
    ...overrides
  });
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-target-create-request-qc-"));
  const costPackagePath = path.join(tempRoot, "storage-schema-target-cost-confirmation-package.json");
  const readyCostPackage = costPackage();
  await writeJson(costPackagePath, readyCostPackage);

  const missingReport = await buildStorageSchemaTargetCreateRequest({});
  record("STORAGE-SCHEMA-TARGET-CREATE-001 request version is stable", missingReport.requestVersion === STORAGE_SCHEMA_TARGET_CREATE_REQUEST_VERSION);
  record("STORAGE-SCHEMA-TARGET-CREATE-002 missing cost package blocks request", missingReport.summary.status === "blocked_missing_cost_confirmation_package");

  const missingUserEvidence = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: costPackagePath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-003 missing user evidence blocks request", missingUserEvidence.summary.status === "blocked_missing_user_confirmation_evidence");

  const blockedUserEvidence = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath
  });
  const blockedUserEvidencePath = path.join(tempRoot, "blocked-user-cost-confirmation-evidence.json");
  await writeJson(blockedUserEvidencePath, blockedUserEvidence);
  const blockedUserRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: blockedUserEvidencePath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-004 unconfirmed user evidence blocks request", blockedUserRequest.summary.status === "blocked_user_cost_not_confirmed");
  record("STORAGE-SCHEMA-TARGET-CREATE-005 blocked request has no connector plan", blockedUserRequest.connectorPlan.length === 0);

  const confirmedUserEvidence = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath,
    confirmationText: readyCostPackage.handoff.confirmationText,
    confirmedBy: "user"
  });
  const confirmedUserEvidencePath = path.join(tempRoot, "user-cost-confirmation-evidence.json");
  await writeJson(confirmedUserEvidencePath, confirmedUserEvidence);
  const readyProjectRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: confirmedUserEvidencePath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-006 confirmed project request is ready", readyProjectRequest.summary.status === "ready_for_supabase_target_create_request");
  record("STORAGE-SCHEMA-TARGET-CREATE-007 project request remains evidence-only", readyProjectRequest.assumptions.noSupabaseConfirmCostCalled === true && readyProjectRequest.assumptions.noSupabaseProjectCreated === true);
  record("STORAGE-SCHEMA-TARGET-CREATE-008 project request has confirm then create plan", readyProjectRequest.connectorPlan.length === 2 && readyProjectRequest.connectorPlan[0].operation === "confirm_cost" && readyProjectRequest.connectorPlan[1].operation === "create_project");
  record("STORAGE-SCHEMA-TARGET-CREATE-009 project request arguments are scoped", readyProjectRequest.connectorPlan[1].arguments.organization_id === "igzdpafkvqqpsyadmage" && readyProjectRequest.connectorPlan[1].arguments.name === "AI_PDM_STAGING");
  record("STORAGE-SCHEMA-TARGET-CREATE-018 ready project request requires fresh matching upstream evidence", readyProjectRequest.readiness.upstreamEvidenceFresh === true && readyProjectRequest.summary.userConfirmationSourceMatchesCostPackage === true);

  const regeneratedCostPackagePath = path.join(tempRoot, "regenerated-cost-package.json");
  await writeJson(regeneratedCostPackagePath, {
    ...readyCostPackage,
    generatedAt: new Date(Date.parse(readyCostPackage.generatedAt) - 1000).toISOString()
  });
  const mismatchedSourceRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: regeneratedCostPackagePath,
    userCostConfirmedEvidencePath: confirmedUserEvidencePath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-019 mismatched source cost package blocks request", mismatchedSourceRequest.summary.status === "blocked_user_confirmation_source_package_mismatch");

  const branchCostPackagePath = path.join(tempRoot, "branch-cost-package.json");
  const branchCostPackage = costPackage({ preferredResource: "branch" });
  await writeJson(branchCostPackagePath, branchCostPackage);
  const branchUserEvidence = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: branchCostPackagePath,
    confirmationText: branchCostPackage.handoff.confirmationText,
    confirmedBy: "user"
  });
  const branchUserEvidencePath = path.join(tempRoot, "branch-user-evidence.json");
  await writeJson(branchUserEvidencePath, branchUserEvidence);
  const blockedBranchRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: branchCostPackagePath,
    userCostConfirmedEvidencePath: branchUserEvidencePath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-010 branch request requires source project id", blockedBranchRequest.summary.status === "blocked_missing_source_project_id");
  const readyBranchRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: branchCostPackagePath,
    userCostConfirmedEvidencePath: branchUserEvidencePath,
    sourceProjectId: "knodlkxqpcqyrtgwpdst"
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-011 branch request has confirm then branch plan", readyBranchRequest.connectorPlan.length === 2 && readyBranchRequest.connectorPlan[1].operation === "create_branch");

  const outputs = await writeStorageSchemaTargetCreateRequest(readyProjectRequest, tempRoot);
  record("STORAGE-SCHEMA-TARGET-CREATE-012 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-TARGET-CREATE-013 output does not print database URL", !outputBody.includes("postgres://"));

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-target-create-request.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-014 package scripts are registered",
    packageJson.includes('"storage:schema-target-create-request"') &&
      packageJson.includes('"qc:file-storage-schema-target-create-request"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-015 PM evidence references target create request lane",
    planSource.includes("Phase 5E") &&
      planSource.includes("storage:schema-target-create-request") &&
      planSource.includes("qc:file-storage-schema-target-create-request") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-016 generator does not call Supabase resource APIs",
    !generatorSource.includes("_confirm_cost") &&
      !generatorSource.includes("_create_project") &&
      !generatorSource.includes("_create_branch") &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, missingUserEvidence, blockedUserRequest, readyProjectRequest, blockedBranchRequest, readyBranchRequest]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-017 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
