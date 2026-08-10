#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_TARGET_PROVISIONING_EXECUTION_PACKAGE_VERSION =
  "storage-schema-target-provisioning-execution-package/v1";

const root = process.cwd();

function isInsideDirectory(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toProjectRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

async function readInputJson(filePath) {
  if (!filePath) return { missing: true, path: "" };
  const resolvedPath = path.resolve(filePath);
  try {
    return {
      missing: false,
      path: resolvedPath,
      value: isInsideDirectory(root, resolvedPath)
        ? readProjectJson(root, toProjectRelative(resolvedPath))
        : JSON.parse(await readFile(resolvedPath, "utf8"))
    };
  } catch (error) {
    return {
      missing: true,
      path: resolvedPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function basename(source) {
  return source.path ? path.basename(source.path) : "";
}

function isCreateRequestReady(createRequest) {
  return createRequest?.reportType === "supabase-target-create-request" &&
    createRequest?.summary?.status === "ready_for_supabase_target_create_request" &&
    createRequest?.summary?.userConfirmationSourceMatchesCostPackage === true &&
    createRequest?.readiness?.readyForConnectorExecution === true &&
    createRequest?.readiness?.upstreamEvidenceFresh === true &&
    Array.isArray(createRequest?.connectorPlan) &&
    createRequest.connectorPlan.length > 0;
}

function isReceiptRecorded(connectorReceipt) {
  return connectorReceipt?.reportType === "supabase-target-connector-receipt-evidence" &&
    connectorReceipt?.summary?.status === "connector_execution_receipt_recorded" &&
    connectorReceipt?.summary?.receiptRecorded === true;
}

function isTargetVerified(createResult) {
  return createResult?.reportType === "supabase-target-create-result-evidence" &&
    createResult?.summary?.status === "target_created_inventory_verified" &&
    createResult?.readiness?.readyForTargetReadinessGate === true &&
    Number(createResult?.summary?.verifiedTargetCount ?? 0) > 0;
}

function statusFor({ createRequestEvidence, connectorReceiptEvidence, createResultEvidence }) {
  const createRequest = createRequestEvidence.value;
  const connectorReceipt = connectorReceiptEvidence.value;
  const createResult = createResultEvidence.value;

  if (createRequestEvidence.missing) return "blocked_missing_target_create_request";
  if (createRequest?.reportType !== "supabase-target-create-request") return "blocked_invalid_target_create_request";
  if (!isCreateRequestReady(createRequest)) return "blocked_create_request_not_ready";

  if (createResultEvidence.missing && connectorReceiptEvidence.missing) return "ready_for_connector_execution";
  if (!connectorReceiptEvidence.missing && connectorReceipt?.reportType !== "supabase-target-connector-receipt-evidence") {
    return "blocked_invalid_connector_receipt_evidence";
  }
  if (!createResultEvidence.missing && createResult?.reportType !== "supabase-target-create-result-evidence") {
    return "blocked_invalid_target_create_result_evidence";
  }
  if (!isReceiptRecorded(connectorReceipt)) return "ready_for_connector_execution";
  if (isTargetVerified(createResult)) return "target_provisioning_verified";
  return "waiting_for_refreshed_project_inventory";
}

function blockerForStatus(status) {
  if (status === "blocked_missing_target_create_request") return "missing target create request evidence";
  if (status === "blocked_invalid_target_create_request") return "target create request evidence is invalid";
  if (status === "blocked_create_request_not_ready") return "target create request is not ready for connector execution";
  if (status === "blocked_invalid_connector_receipt_evidence") return "connector receipt evidence is invalid";
  if (status === "blocked_invalid_target_create_result_evidence") return "target create result evidence is invalid";
  return "";
}

function nextActions(report) {
  if (report.summary.status === "ready_for_connector_execution") {
    return [
      "Before calling Supabase confirm_cost, re-check that the cost package and user confirmation evidence are still current",
      "Call Supabase confirm_cost, then create_project or create_branch exactly as listed in connectorPlan",
      "Record the returned confirm_cost_id and created project/branch ref with storage:schema-target-connector-receipt-evidence"
    ];
  }
  if (report.summary.status === "waiting_for_refreshed_project_inventory") {
    return [
      "Export Supabase project inventory after connector execution",
      "Run storage:schema-target-create-result-evidence with connector receipt evidence and refreshed inventory",
      "Do not run schema apply until target create result status is target_created_inventory_verified"
    ];
  }
  if (report.summary.status === "target_provisioning_verified") {
    return [
      "Regenerate storage:schema-target-readiness-package with refreshed inventory",
      "Proceed to storage:schema-apply-gate only after target readiness is clean"
    ];
  }
  return [
    "Resolve upstream target create request blockers before any Supabase confirm_cost or create call",
    "Do not create Supabase resources from this package while summary.readyForConnectorExecution is false"
  ];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Target Provisioning Execution Package",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Ready for connector execution: ${report.readiness.readyForConnectorExecution}`,
    `- Waiting for inventory verification: ${report.readiness.waitingForInventoryVerification}`,
    `- Target provisioning verified: ${report.readiness.targetProvisioningVerified}`,
    `- Target name: ${report.target.targetName || "-"}`,
    `- Resource type: ${report.target.resourceType || "-"}`,
    "",
    "## Blockers",
    ""
  ];

  if (report.blockers.length === 0) {
    lines.push("- None.");
  } else {
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }

  lines.push("", "## Connector Plan", "");
  if (report.connectorPlan.length === 0) {
    lines.push("- Not available until target create request is ready.");
  } else {
    for (const step of report.connectorPlan) {
      lines.push(`- Step ${step.order}: ${step.connector}.${step.operation}`);
    }
  }

  lines.push("", "## Guardrails", "");
  lines.push(`- Evidence only: ${report.assumptions.evidenceOnly}`);
  lines.push(`- No Supabase connector call made by generator: ${report.assumptions.generatorDidNotCallSupabaseConnector}`);
  lines.push(`- No database connection: ${report.assumptions.noDatabaseConnection}`);
  lines.push(`- No SQL applied: ${report.assumptions.noSqlApplied}`);

  lines.push("", "## Next Actions", "");
  for (const action of report.handoff.nextActions) lines.push(`- ${action}`);

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetProvisioningExecutionPackage(options = {}) {
  const createRequestEvidence = await readInputJson(options.targetCreateRequestPath ?? "");
  const connectorReceiptEvidence = await readInputJson(options.connectorReceiptEvidencePath ?? "");
  const createResultEvidence = await readInputJson(options.targetCreateResultEvidencePath ?? "");
  const createRequest = createRequestEvidence.value ?? {};
  const connectorReceipt = connectorReceiptEvidence.value ?? {};
  const createResult = createResultEvidence.value ?? {};
  const status = statusFor({ createRequestEvidence, connectorReceiptEvidence, createResultEvidence });
  const blocker = blockerForStatus(status);
  const connectorPlan = isCreateRequestReady(createRequest) ? createRequest.connectorPlan : [];

  const report = {
    reportType: "supabase-target-provisioning-execution-package",
    packageVersion: STORAGE_SCHEMA_TARGET_PROVISIONING_EXECUTION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      generatorDidNotCallSupabaseConnector: true,
      noSupabaseConfirmCostCalled: true,
      noSupabaseProjectCreated: true,
      noSupabaseBranchCreated: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      targetCreateRequestPath: basename(createRequestEvidence),
      connectorReceiptEvidencePath: basename(connectorReceiptEvidence),
      targetCreateResultEvidencePath: basename(createResultEvidence)
    },
    sourceEvidence: {
      createRequestStatus: createRequest?.summary?.status ?? (createRequestEvidence.missing ? "missing" : "unknown"),
      createRequestReady: isCreateRequestReady(createRequest),
      createRequestUpstreamEvidenceFresh: createRequest?.readiness?.upstreamEvidenceFresh === true,
      createRequestUserConfirmationSourceMatchesCostPackage: createRequest?.summary?.userConfirmationSourceMatchesCostPackage === true,
      connectorReceiptStatus: connectorReceipt?.summary?.status ?? (connectorReceiptEvidence.missing ? "missing" : "unknown"),
      receiptRecorded: isReceiptRecorded(connectorReceipt),
      targetCreateResultStatus: createResult?.summary?.status ?? (createResultEvidence.missing ? "missing" : "unknown"),
      verifiedTargetCount: Number(createResult?.summary?.verifiedTargetCount ?? 0)
    },
    target: {
      organizationId: createRequest?.target?.organizationId ?? "",
      targetName: createRequest?.target?.targetName ?? createResult?.target?.targetName ?? "",
      region: createRequest?.target?.region ?? createResult?.target?.region ?? "",
      resourceType: createRequest?.selectedCost?.type ?? createResult?.target?.resourceType ?? ""
    },
    selectedCost: {
      amount: createRequest?.selectedCost?.amount ?? null,
      recurrence: createRequest?.selectedCost?.recurrence ?? ""
    },
    connectorPlan,
    blockers: blocker ? [blocker] : [],
    summary: {
      status,
      readyForConnectorExecution: status === "ready_for_connector_execution",
      targetProvisioningVerified: status === "target_provisioning_verified"
    },
    readiness: {
      readyForConnectorExecution: status === "ready_for_connector_execution",
      waitingForInventoryVerification: status === "waiting_for_refreshed_project_inventory",
      targetProvisioningVerified: status === "target_provisioning_verified",
      readyForSchemaTargetReadinessPackage: status === "target_provisioning_verified"
    },
    handoff: {
      nextActions: []
    }
  };
  report.handoff.nextActions = nextActions(report);
  return report;
}

export async function writeStorageSchemaTargetProvisioningExecutionPackage(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "supabase-target-provisioning-execution-package.json");
  const markdownPath = path.join(resolvedOutputDir, "supabase-target-provisioning-execution-package.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    targetCreateRequestPath: "",
    connectorReceiptEvidencePath: "",
    targetCreateResultEvidencePath: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-create-request") parsed.targetCreateRequestPath = argv[++index] ?? "";
    else if (arg === "--connector-receipt-evidence") parsed.connectorReceiptEvidencePath = argv[++index] ?? "";
    else if (arg === "--target-create-result-evidence") parsed.targetCreateResultEvidencePath = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaTargetProvisioningExecutionPackage(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetProvisioningExecutionPackage(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
