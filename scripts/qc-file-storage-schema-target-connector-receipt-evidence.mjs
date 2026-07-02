#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_CONNECTOR_RECEIPT_EVIDENCE_VERSION,
  buildStorageSchemaTargetConnectorReceiptEvidence,
  writeStorageSchemaTargetConnectorReceiptEvidence
} from "./generate-file-storage-schema-target-connector-receipt-evidence.mjs";
import { buildStorageSchemaTargetCostConfirmationPackage } from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";
import { buildStorageSchemaUserCostConfirmationEvidence } from "./generate-file-storage-schema-user-cost-confirmation-evidence.mjs";
import { buildStorageSchemaTargetCreateRequest } from "./generate-file-storage-schema-target-create-request.mjs";
import { buildStorageSchemaTargetCreateResultEvidence } from "./generate-file-storage-schema-target-create-result-evidence.mjs";
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

async function readyCreateRequest(tempRoot) {
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
  return buildStorageSchemaTargetCreateRequest({
    costConfirmationPackagePath: costPackagePath,
    userCostConfirmedEvidencePath: userEvidencePath
  });
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-target-connector-receipt-qc-"));
  const request = await readyCreateRequest(tempRoot);
  const requestPath = path.join(tempRoot, "supabase-target-create-request.json");
  await writeJson(requestPath, request);

  const missingReport = await buildStorageSchemaTargetConnectorReceiptEvidence({});
  record("STORAGE-SCHEMA-TARGET-RECEIPT-001 evidence version is stable", missingReport.evidenceVersion === STORAGE_SCHEMA_TARGET_CONNECTOR_RECEIPT_EVIDENCE_VERSION);
  record("STORAGE-SCHEMA-TARGET-RECEIPT-002 missing create request blocks receipt", missingReport.summary.status === "blocked_missing_target_create_request");

  const blockedRequest = { ...request, summary: { ...request.summary, status: "blocked_user_cost_not_confirmed" } };
  const blockedRequestPath = path.join(tempRoot, "blocked-create-request.json");
  await writeJson(blockedRequestPath, blockedRequest);
  const blockedRequestReport = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: blockedRequestPath
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-003 not-ready create request blocks receipt", blockedRequestReport.summary.status === "blocked_create_request_not_ready");

  const missingConfirmReport = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: requestPath
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-004 missing confirm cost receipt blocks", missingConfirmReport.summary.status === "blocked_missing_confirm_cost_receipt");

  const missingCreateReport = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: requestPath,
    confirmCostId: "cost-confirmation-test"
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-005 missing create receipt blocks", missingCreateReport.summary.status === "blocked_missing_create_receipt");

  const mismatchReport = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: requestPath,
    confirmCostId: "cost-confirmation-test",
    createdResourceId: "aiabcdefghijklmnop",
    createdTargetName: "WRONG_TARGET"
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-006 mismatched receipt blocks", mismatchReport.summary.status === "blocked_create_receipt_mismatch");

  const recordedReport = await buildStorageSchemaTargetConnectorReceiptEvidence({
    targetCreateRequestPath: requestPath,
    confirmCostId: "cost-confirmation-test",
    createdResourceId: "aiabcdefghijklmnop",
    createdResourceType: "project",
    createdTargetName: "AI_PDM_STAGING",
    createdRegion: "ap-southeast-1"
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-007 matching receipt is recorded", recordedReport.summary.status === "connector_execution_receipt_recorded" && recordedReport.summary.receiptRecorded === true);
  record("STORAGE-SCHEMA-TARGET-RECEIPT-008 recorded receipt is result-compatible", recordedReport.summary.readyForCreateResultEvidence === true);

  const receiptPath = path.join(tempRoot, "supabase-target-connector-receipt-evidence.json");
  await writeJson(receiptPath, recordedReport);
  const inventoryPath = path.join(tempRoot, "project-inventory.json");
  await writeJson(inventoryPath, {
    projects: [{ name: "AI_PDM_STAGING", ref: "aiabcdefghijklmnop", region: "ap-southeast-1", status: "ACTIVE_HEALTHY" }]
  });
  const resultReport = await buildStorageSchemaTargetCreateResultEvidence({
    targetCreateRequestPath: requestPath,
    connectorReceiptEvidencePath: receiptPath,
    projectsReportPath: inventoryPath
  });
  record("STORAGE-SCHEMA-TARGET-RECEIPT-009 receipt unlocks create result with inventory", resultReport.summary.status === "target_created_inventory_verified");

  const outputs = await writeStorageSchemaTargetConnectorReceiptEvidence(recordedReport, tempRoot);
  record("STORAGE-SCHEMA-TARGET-RECEIPT-010 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-TARGET-RECEIPT-011 output does not print database URL", !outputBody.includes("postgres://"));

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-target-connector-receipt-evidence.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");
  record(
    "STORAGE-SCHEMA-TARGET-RECEIPT-012 package scripts are registered",
    packageJson.includes('"storage:schema-target-connector-receipt-evidence"') &&
      packageJson.includes('"qc:file-storage-schema-target-connector-receipt-evidence"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-RECEIPT-013 PM evidence references target connector receipt lane",
    planSource.includes("Phase 5G") &&
      planSource.includes("storage:schema-target-connector-receipt-evidence") &&
      planSource.includes("qc:file-storage-schema-target-connector-receipt-evidence") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-TARGET-RECEIPT-014 generator does not call Supabase resource APIs",
    !/_confirm_cost\s*\(/.test(generatorSource) &&
      !/_create_project\s*\(/.test(generatorSource) &&
      !/_create_branch\s*\(/.test(generatorSource) &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, blockedRequestReport, missingConfirmReport, missingCreateReport, mismatchReport, recordedReport, resultReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-RECEIPT-015 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
