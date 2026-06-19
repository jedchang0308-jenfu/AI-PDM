#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildStorageSchemaTargetProvisioningExecutionPackage,
  writeStorageSchemaTargetProvisioningExecutionPackage
} from "./generate-file-storage-schema-target-provisioning-execution-package.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readyCreateRequest() {
  return {
    reportType: "supabase-target-create-request",
    summary: {
      status: "ready_for_supabase_target_create_request",
      userConfirmationSourceMatchesCostPackage: true
    },
    readiness: {
      readyForConnectorExecution: true,
      upstreamEvidenceFresh: true
    },
    target: {
      organizationId: "org_123",
      targetName: "AI_PDM_STAGING",
      region: "ap-southeast-1"
    },
    selectedCost: {
      type: "project",
      amount: 0,
      recurrence: "monthly"
    },
    connectorPlan: [
      {
        order: 1,
        connector: "Supabase",
        operation: "confirm_cost",
        arguments: { type: "project", amount: 0, recurrence: "monthly" },
        outputRequired: "confirm_cost_id"
      },
      {
        order: 2,
        connector: "Supabase",
        operation: "create_project",
        arguments: { organization_id: "org_123", name: "AI_PDM_STAGING", region: "ap-southeast-1" },
        requires: "confirm_cost_id from step 1"
      }
    ]
  };
}

function blockedCreateRequest() {
  return {
    ...readyCreateRequest(),
    summary: { status: "blocked_user_cost_not_confirmed" },
    readiness: { readyForConnectorExecution: false },
    connectorPlan: []
  };
}

function staleReadyCreateRequest() {
  return {
    ...readyCreateRequest(),
    readiness: {
      readyForConnectorExecution: true,
      upstreamEvidenceFresh: false
    }
  };
}

function recordedReceipt() {
  return {
    reportType: "supabase-target-connector-receipt-evidence",
    summary: {
      status: "connector_execution_receipt_recorded",
      receiptRecorded: true
    },
    target: {
      organizationId: "org_123",
      targetName: "AI_PDM_STAGING",
      resourceType: "project",
      region: "ap-southeast-1"
    },
    receipts: {
      confirmCostId: "cc_test_123",
      createdResourceId: "newtargetref1234567890"
    }
  };
}

function unrecordedReceipt() {
  return {
    reportType: "supabase-target-connector-receipt-evidence",
    summary: {
      status: "blocked_missing_confirm_cost_receipt",
      receiptRecorded: false
    }
  };
}

function verifiedCreateResult() {
  return {
    reportType: "supabase-target-create-result-evidence",
    summary: {
      status: "target_created_inventory_verified",
      verifiedTargetCount: 1
    },
    readiness: {
      readyForTargetReadinessGate: true
    },
    target: {
      targetName: "AI_PDM_STAGING",
      resourceType: "project",
      region: "ap-southeast-1"
    }
  };
}

function blockedCreateResult() {
  return {
    ...verifiedCreateResult(),
    summary: {
      status: "blocked_target_not_found_in_inventory",
      verifiedTargetCount: 0
    },
    readiness: {
      readyForTargetReadinessGate: false
    }
  };
}

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-target-provisioning-execution-qc-"));
  const missing = await buildStorageSchemaTargetProvisioningExecutionPackage({});
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-001 missing create request blocks package", missing.summary.status === "blocked_missing_target_create_request");

  const blockedRequestPath = path.join(tempRoot, "blocked-request.json");
  await writeJson(blockedRequestPath, blockedCreateRequest());
  const blocked = await buildStorageSchemaTargetProvisioningExecutionPackage({ targetCreateRequestPath: blockedRequestPath });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-002 blocked create request blocks connector execution", blocked.summary.status === "blocked_create_request_not_ready" && blocked.readiness.readyForConnectorExecution === false);

  const staleReadyRequestPath = path.join(tempRoot, "stale-ready-request.json");
  await writeJson(staleReadyRequestPath, staleReadyCreateRequest());
  const staleReady = await buildStorageSchemaTargetProvisioningExecutionPackage({ targetCreateRequestPath: staleReadyRequestPath });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-016 stale ready request still blocks connector execution", staleReady.summary.status === "blocked_create_request_not_ready" && staleReady.sourceEvidence.createRequestUpstreamEvidenceFresh === false);

  const readyRequestPath = path.join(tempRoot, "ready-request.json");
  await writeJson(readyRequestPath, readyCreateRequest());
  const ready = await buildStorageSchemaTargetProvisioningExecutionPackage({ targetCreateRequestPath: readyRequestPath });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-003 ready create request enables connector execution package", ready.summary.status === "ready_for_connector_execution" && ready.connectorPlan.length === 2);
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-004 ready package still does not claim Supabase was called", ready.assumptions.generatorDidNotCallSupabaseConnector === true && ready.assumptions.noSupabaseProjectCreated === true);

  const invalidReceiptPath = path.join(tempRoot, "invalid-receipt.json");
  await writeJson(invalidReceiptPath, { reportType: "wrong" });
  const invalidReceipt = await buildStorageSchemaTargetProvisioningExecutionPackage({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: invalidReceiptPath
  });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-005 invalid receipt evidence blocks package", invalidReceipt.summary.status === "blocked_invalid_connector_receipt_evidence");

  const unrecordedReceiptPath = path.join(tempRoot, "unrecorded-receipt.json");
  await writeJson(unrecordedReceiptPath, unrecordedReceipt());
  const unrecorded = await buildStorageSchemaTargetProvisioningExecutionPackage({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: unrecordedReceiptPath
  });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-006 unrecorded receipt keeps package ready for connector execution", unrecorded.summary.status === "ready_for_connector_execution");

  const receiptPath = path.join(tempRoot, "receipt.json");
  await writeJson(receiptPath, recordedReceipt());
  const waiting = await buildStorageSchemaTargetProvisioningExecutionPackage({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath
  });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-007 recorded receipt waits for refreshed inventory", waiting.summary.status === "waiting_for_refreshed_project_inventory" && waiting.readiness.waitingForInventoryVerification === true);

  const blockedResultPath = path.join(tempRoot, "blocked-result.json");
  await writeJson(blockedResultPath, blockedCreateResult());
  const blockedResult = await buildStorageSchemaTargetProvisioningExecutionPackage({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath,
    targetCreateResultEvidencePath: blockedResultPath
  });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-008 blocked create result still waits for inventory verification", blockedResult.summary.status === "waiting_for_refreshed_project_inventory");

  const verifiedResultPath = path.join(tempRoot, "verified-result.json");
  await writeJson(verifiedResultPath, verifiedCreateResult());
  const verified = await buildStorageSchemaTargetProvisioningExecutionPackage({
    targetCreateRequestPath: readyRequestPath,
    connectorReceiptEvidencePath: receiptPath,
    targetCreateResultEvidencePath: verifiedResultPath
  });
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-009 verified create result closes provisioning package", verified.summary.status === "target_provisioning_verified" && verified.readiness.readyForSchemaTargetReadinessPackage === true);

  const outputDir = path.join(tempRoot, "out");
  const output = await writeStorageSchemaTargetProvisioningExecutionPackage(ready, outputDir);
  const markdown = await fsp.readFile(output.markdownPath, "utf8");
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-010 output files are written", Boolean(output.jsonPath && output.markdownPath));
  record("STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-011 markdown records guardrails and connector plan", markdown.includes("No Supabase connector call made by generator: true") && markdown.includes("Step 1: Supabase.confirm_cost"));

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  record(
    "STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-012 package scripts are registered",
    packageJson.includes('"storage:schema-target-provisioning-execution-package"') &&
      packageJson.includes('"qc:file-storage-schema-target-provisioning-execution-package"')
  );

  const planSource = await fsp.readFile(path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"), "utf8");
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");
  record(
    "STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-013 PM evidence references Phase 5I and Phase 5K",
    planSource.includes("Phase 5I") && devTaskSource.includes("Phase 5I") && planSource.includes("Phase 5K") && devTaskSource.includes("Phase 5K")
  );

  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-target-provisioning-execution-package.mjs"), "utf8");
  record(
    "STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-014 generator is evidence-only and has no connector imports",
    !/(mcp__codex_apps__supabase|_confirm_cost|_create_project|_create_branch)/.test(generatorSource)
  );

  const serialized = JSON.stringify([ready, waiting, verified]);
  record(
    "STORAGE-SCHEMA-TARGET-PROVISIONING-EXECUTION-015 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
