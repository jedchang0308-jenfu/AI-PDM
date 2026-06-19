#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_CREATE_RESULT_EVIDENCE_VERSION,
  buildStorageSchemaTargetCreateResultEvidence,
  writeStorageSchemaTargetCreateResultEvidence
} from "./generate-file-storage-schema-target-create-result-evidence.mjs";
import { buildStorageSchemaTargetCostConfirmationPackage } from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";
import { buildStorageSchemaUserCostConfirmationEvidence } from "./generate-file-storage-schema-user-cost-confirmation-evidence.mjs";
import { buildStorageSchemaTargetCreateRequest } from "./generate-file-storage-schema-target-create-request.mjs";
import { buildStorageSchemaTargetConnectorReceiptEvidence } from "./generate-file-storage-schema-target-connector-receipt-evidence.mjs";

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

function projectInventory(projects) {
  return {
    source: "test",
    projects
  };
}

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-target-create-result-qc-"));
  const costPackage = buildStorageSchemaTargetCostConfirmationPackage({
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
  const costPackagePath = path.join(tempRoot, "storage-schema-target-cost-confirmation-package.json");
  await writeJson(costPackagePath, costPackage);
  const userEvidence = await buildStorageSchemaUserCostConfirmationEvidence({
    costConfirmationPackagePath: costPackagePath,
    confirmationText: costPackage.handoff.confirmationText,
    confirmedBy: "user"
  });
  const userEvidencePath = path.join(tempRoot, "user-cost-confirmation-evidence.json");
  await writeJson(userEvidencePath, userEvidence);
  const readyRequest = await buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userEvidencePath
  });
  const readyRequestPath = path.join(tempRoot, "supabase-target-create-request.json");
  await writeJson(readyRequestPath, readyRequest);

  const missingReport = await buildStorageSchemaTargetCreateResultEvidence({});
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-001 evidence version is stable", missingReport.evidenceVersion === STORAGE_SCHEMA_TARGET_CREATE_RESULT_EVIDENCE_VERSION);
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-002 missing create request blocks result", missingReport.summary.status === "blocked_missing_target_create_request");

  const blockedRequest = { ...readyRequest, summary: { ...readyRequest.summary, status: "blocked_user_cost_not_confirmed" } };
  const blockedRequestPath = path.join(tempRoot, "blocked-create-request.json");
  await writeJson(blockedRequestPath, blockedRequest);
  const blockedRequestReport = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: blockedRequestPath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-003 not-ready create request blocks result", blockedRequestReport.summary.status === "blocked_create_request_not_ready");

  const missingInventoryReport = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: readyRequestPath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-004 ready request still requires receipt", missingInventoryReport.summary.status === "blocked_missing_connector_receipt_evidence");

  const receipt = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: readyRequestPath,
    confirmCostId: "cost-confirmation-test",
    createdResourceId: "aiabcdefghijklmnop",
    createdResourceType: "project",
    createdTargetName: "AI_PDM_STAGING",
    createdRegion: "ap-southeast-1"
  });
  const receiptPath = path.join(tempRoot, "supabase-target-connector-receipt-evidence.json");
  await writeJson(receiptPath, receipt);
  const missingInventoryWithReceiptReport = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-005 recorded receipt still requires inventory", missingInventoryWithReceiptReport.summary.status === "blocked_missing_project_inventory");

  const noTargetInventoryPath = path.join(tempRoot, "no-target-inventory.json");
  await writeJson(noTargetInventoryPath, projectInventory([{ name: "ProJED", ref: "knodlkxqpcqyrtgwpdst" }]));
  const noTargetReport = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath,
    projectsReportPath: noTargetInventoryPath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-006 inventory without target blocks result", noTargetReport.summary.status === "blocked_target_not_found_in_inventory");

  const readyInventoryPath = path.join(tempRoot, "ready-inventory.json");
  await writeJson(readyInventoryPath, projectInventory([
    { name: "AI_PDM_STAGING", ref: "aiabcdefghijklmnop", region: "ap-southeast-1", status: "ACTIVE_HEALTHY" }
  ]));
  const readyResult = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath,
    projectsReportPath: readyInventoryPath
  });
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-007 receipt plus refreshed inventory verifies target", readyResult.summary.status === "target_created_inventory_verified");
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-008 verified result unlocks target readiness handoff", readyResult.readiness.readyForTargetReadinessGate === true);
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-009 verified result remains evidence-only", readyResult.assumptions.noDatabaseConnection === true && readyResult.assumptions.noSqlApplied === true);

  const outputs = await writeStorageSchemaTargetCreateResultEvidence(readyResult, tempRoot);
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-010 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-TARGET-CREATE-RESULT-011 output does not print database URL", !outputBody.includes("postgres://"));

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-target-create-result-evidence.mjs"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-RESULT-012 package scripts are registered",
    packageJson.includes('"storage:schema-target-create-result-evidence"') &&
      packageJson.includes('"qc:file-storage-schema-target-create-result-evidence"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-RESULT-013 PM evidence references Phase 5F",
    planSource.includes("Phase 5F") && devTaskSource.includes("Phase 5F")
  );
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-RESULT-014 generator does not call Supabase resource APIs",
    !generatorSource.includes("_confirm_cost") &&
      !generatorSource.includes("_create_project") &&
      !generatorSource.includes("_create_branch") &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, blockedRequestReport, missingInventoryReport, missingInventoryWithReceiptReport, noTargetReport, readyResult]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-CREATE-RESULT-015 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
