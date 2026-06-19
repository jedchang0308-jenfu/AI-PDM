#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";

const DEFAULT_EVIDENCE_DIR = ".ai-doc/reports/pm/supabase-target-provisioning-evidence-2026-06-11";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

function parseArgs(argv) {
  const parsed = { evidenceDir: DEFAULT_EVIDENCE_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--evidence-dir") parsed.evidenceDir = argv[++index] ?? DEFAULT_EVIDENCE_DIR;
  }
  return parsed;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(args.evidenceDir);
  const inventory = await readJson(path.join(evidenceDir, "project-inventory.json"));
  const readinessPackage = await readJson(path.join(evidenceDir, "storage-schema-target-readiness-package.json"));
  const costPackage = await readJson(path.join(evidenceDir, "storage-schema-target-cost-confirmation-package.json"));
  const userCostConfirmation = await readJson(path.join(evidenceDir, "user-cost-confirmation-evidence.json"));
  const targetCreateRequest = await readJson(path.join(evidenceDir, "supabase-target-create-request.json"));
  const targetConnectorReceipt = await readJson(path.join(evidenceDir, "supabase-target-connector-receipt-evidence.json"));
  const targetCreateResult = await readJson(path.join(evidenceDir, "supabase-target-create-result-evidence.json"));
  const targetProvisioningExecution = await readJson(path.join(evidenceDir, "supabase-target-provisioning-execution-package.json"));
  const formalPackage = await readJson(path.join(evidenceDir, "storage-schema-formal-review-package.json"));
  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );

  const projectNames = inventory.projects.map((project) => project.name);
  const projectRefs = inventory.projects.map((project) => project.ref);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-001 inventory is from Supabase connector", inventory.source === "Supabase connector list_projects");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-002 inventory contains only current ProJED projects", projectNames.includes("ProJED") && projectNames.includes("ProJED_TEST") && !projectNames.includes("AI_PDM_STAGING"));
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-003 inventory keeps known forbidden refs", projectRefs.includes("knodlkxqpcqyrtgwpdst") && projectRefs.includes("fhisnnufoeulxqrchldf"));

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-004 readiness package blocks schema apply", readinessPackage.summary.status === "blocked_target_readiness");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-005 readiness source sees no approved target", readinessPackage.sourceReadiness.summary.status === "blocked_no_approved_target" && readinessPackage.sourceReadiness.summary.readyCandidateCount === 0);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-006 readiness package blocks ProJED targets", readinessPackage.handoff.blockedActions.some((action) => action.includes("Do not use ProJED or ProJED_TEST")));

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-007 cost package is ready for user confirmation", costPackage.summary.status === "ready_for_user_cost_confirmation");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-008 project cost evidence is current package value", costPackage.costEvidence.project.amount === 0 && costPackage.costEvidence.project.recurrence === "monthly");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-009 branch cost evidence is current package value", costPackage.costEvidence.branch.amount === 0.01344 && costPackage.costEvidence.branch.recurrence === "hourly");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-010 cost package is not create-ready", costPackage.readiness.readyForSupabaseCreateCall === false && costPackage.assumptions.noSupabaseProjectCreated === true);

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-011 user confirmation evidence is present", userCostConfirmation.reportType === "supabase-target-user-cost-confirmation-evidence");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-012 user confirmation is still blocked", userCostConfirmation.summary.status === "blocked_missing_user_confirmation" && userCostConfirmation.confirmationRecorded === false);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-013 user confirmation evidence matches current cost package", userCostConfirmation.targetName === "AI_PDM_STAGING" && userCostConfirmation.resourceType === "project" && userCostConfirmation.cost.amount === 0 && userCostConfirmation.cost.recurrence === "monthly");
  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-035 user confirmation evidence records fresh source cost package",
    userCostConfirmation.summary.costPackageFresh === true &&
      userCostConfirmation.costPackage.generatedAt === costPackage.generatedAt &&
      userCostConfirmation.costPackage.packageVersion === costPackage.packageVersion
  );

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-014 target create request is present", targetCreateRequest.reportType === "supabase-target-create-request");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-015 target create request remains blocked", targetCreateRequest.summary.status === "blocked_user_cost_not_confirmed" && targetCreateRequest.readiness.readyForConnectorExecution === false);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-016 target create request has no connector plan", Array.isArray(targetCreateRequest.connectorPlan) && targetCreateRequest.connectorPlan.length === 0);
  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-036 target create request verifies source package but blocks missing user confirmation freshness",
    targetCreateRequest.summary.costPackageFresh === true &&
      targetCreateRequest.summary.userConfirmationSourceMatchesCostPackage === true &&
      targetCreateRequest.summary.userConfirmationFresh === false &&
      targetCreateRequest.readiness.upstreamEvidenceFresh === false
  );

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-017 target connector receipt is present", targetConnectorReceipt.reportType === "supabase-target-connector-receipt-evidence");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-018 target connector receipt remains blocked", targetConnectorReceipt.summary.status === "blocked_create_request_not_ready" && targetConnectorReceipt.summary.receiptRecorded === false);

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-019 target create result is present", targetCreateResult.reportType === "supabase-target-create-result-evidence");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-020 target create result is blocked by request", targetCreateResult.summary.status === "blocked_create_request_not_ready" && targetCreateResult.readiness.readyForTargetReadinessGate === false);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-021 target create result has no verified target", targetCreateResult.summary.verifiedTargetCount === 0);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-022 target create result references connector receipt", targetCreateResult.sourceEvidence.connectorReceiptStatus === "blocked_create_request_not_ready");

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-023 target provisioning execution package is present", targetProvisioningExecution.reportType === "supabase-target-provisioning-execution-package");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-024 target provisioning execution remains blocked", targetProvisioningExecution.summary.status === "blocked_create_request_not_ready" && targetProvisioningExecution.readiness.readyForConnectorExecution === false);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-025 target provisioning execution has no connector plan", Array.isArray(targetProvisioningExecution.connectorPlan) && targetProvisioningExecution.connectorPlan.length === 0);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-026 target provisioning execution references current blockers", targetProvisioningExecution.sourceEvidence.createRequestStatus === "blocked_user_cost_not_confirmed" && targetProvisioningExecution.sourceEvidence.receiptRecorded === false);
  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-037 target provisioning execution carries freshness and source-match evidence",
    targetProvisioningExecution.sourceEvidence.createRequestUpstreamEvidenceFresh === false &&
      targetProvisioningExecution.sourceEvidence.createRequestUserConfirmationSourceMatchesCostPackage === true
  );

  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-027 formal review remains blocked", formalPackage.readiness.readyForFormalMigrationReview === false);
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-028 formal review records target blocker", formalPackage.sourceEvidence.targetReadiness.status === "blocked_target_readiness");
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-029 formal review records blocked user confirmation", formalPackage.sourceEvidence.userCostConfirmation.status === "failed" && formalPackage.blockers.includes("user cost confirmation failed: user confirmation is recorded"));
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-030 formal review records blocked target create result", formalPackage.sourceEvidence.targetCreateResult.status === "blocked_create_request_not_ready" && formalPackage.blockers.includes("target create result failed: target create result is verified"));
  record("STORAGE-SCHEMA-PROVISIONING-EVIDENCE-031 formal review requires schema promotion evidence", formalPackage.sourceEvidence.schemaPromotion.status === "missing" && formalPackage.blockers.includes("missing schema promotion report"));

  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-032 package script is registered",
    packageJson.includes('"qc:file-storage-schema-target-provisioning-evidence"') &&
      packageJson.includes('"storage:schema-target-create-request"') &&
      packageJson.includes('"qc:file-storage-schema-target-create-request"') &&
      packageJson.includes('"storage:schema-target-connector-receipt-evidence"') &&
      packageJson.includes('"qc:file-storage-schema-target-connector-receipt-evidence"') &&
      packageJson.includes('"storage:schema-target-create-result-evidence"') &&
      packageJson.includes('"qc:file-storage-schema-target-create-result-evidence"') &&
      packageJson.includes('"storage:schema-target-provisioning-execution-package"') &&
      packageJson.includes('"qc:file-storage-schema-target-provisioning-execution-package"')
  );
  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-033 PM evidence references Phase 5I and Phase 5K",
    devTaskSource.includes("Phase 5I") && planSource.includes("Phase 5I") && devTaskSource.includes("Phase 5K") && planSource.includes("Phase 5K")
  );

  const serialized = JSON.stringify([inventory, readinessPackage, costPackage, userCostConfirmation, targetCreateRequest, targetConnectorReceipt, targetCreateResult, targetProvisioningExecution, formalPackage]);
  record(
    "STORAGE-SCHEMA-PROVISIONING-EVIDENCE-034 evidence does not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, evidenceDir, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
