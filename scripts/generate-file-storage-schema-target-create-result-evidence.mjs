#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";

export const STORAGE_SCHEMA_TARGET_CREATE_RESULT_EVIDENCE_VERSION = "storage-schema-target-create-result-evidence/v1";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeProjectInventory(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.projects)) return value.projects;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function readJson(filePath) {
  if (!filePath) return { missing: true, path: "" };
  const resolvedPath = path.resolve(filePath);
  try {
    return {
      missing: false,
      path: resolvedPath,
      value: JSON.parse(await fsp.readFile(resolvedPath, "utf8"))
    };
  } catch (error) {
    return {
      missing: true,
      path: resolvedPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function projectHost(project) {
  return project?.database?.host ?? project?.db_host ?? project?.host ?? "";
}

function normalizeProject(project, targetName) {
  const name = String(project?.name ?? project?.project_name ?? "");
  const ref = String(project?.ref ?? project?.id ?? project?.project_ref ?? "");
  const host = projectHost(project);
  const safety = evaluateStorageSchemaTargetSafety({ targetName: name, databaseUrl: host });
  const targetMatches = normalizeName(name) === normalizeName(targetName);
  return {
    name,
    ref,
    region: project?.region ?? "",
    status: project?.status ?? "",
    targetMatches,
    safetyStatus: safety.status,
    safetyReason: safety.reason,
    verifiedTarget: targetMatches && safety.safe
  };
}

function statusFor({ createRequestEvidence, connectorReceiptEvidence, inventoryEvidence, targetSafety, targetProjects }) {
  const createRequest = createRequestEvidence.value;
  const connectorReceipt = connectorReceiptEvidence.value;
  if (createRequestEvidence.missing) return "blocked_missing_target_create_request";
  if (createRequest?.reportType !== "supabase-target-create-request") return "blocked_invalid_target_create_request";
  if (createRequest?.summary?.status !== "ready_for_supabase_target_create_request") return "blocked_create_request_not_ready";
  if (connectorReceiptEvidence.missing) return "blocked_missing_connector_receipt_evidence";
  if (connectorReceipt?.reportType !== "supabase-target-connector-receipt-evidence") return "blocked_invalid_connector_receipt_evidence";
  if (connectorReceipt?.summary?.status !== "connector_execution_receipt_recorded") return "blocked_connector_receipt_not_recorded";
  if (connectorReceipt?.target?.targetName !== createRequest?.target?.targetName) return "blocked_connector_receipt_mismatch";
  if (!targetSafety.safe) return "blocked_unsafe_target";
  if (inventoryEvidence.missing) return "blocked_missing_project_inventory";
  if (targetProjects.some((project) => project.verifiedTarget)) return "target_created_inventory_verified";
  return "blocked_target_not_found_in_inventory";
}

function nextActions(report) {
  if (report.summary.status === "target_created_inventory_verified") {
    return [
      "Regenerate storage:schema-target-readiness-package with the refreshed project inventory",
      "Proceed to storage:schema-apply-gate only after readiness package is ready"
    ];
  }
  if (report.summary.status === "blocked_create_request_not_ready") {
    return ["Do not call Supabase create APIs until the target create request is ready"];
  }
  if (report.summary.status === "blocked_missing_connector_receipt_evidence") {
    return ["Record connector receipt evidence before accepting refreshed inventory as proof of creation"];
  }
  if (report.summary.status === "blocked_target_not_found_in_inventory") {
    return ["Refresh Supabase project inventory after target creation and verify the target name/ref appears"];
  }
  return ["Regenerate upstream create request and inventory evidence before schema apply"];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Target Create Result Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence version: ${report.evidenceVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Target name: ${report.target.targetName || "-"}`,
    `- Verified target count: ${report.summary.verifiedTargetCount}`,
    `- Ready for schema readiness gate: ${report.readiness.readyForTargetReadinessGate}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No SQL applied: ${report.assumptions.noSqlApplied}`,
    `- No provider IO: ${report.assumptions.noProviderIo}`,
    "",
    "## Target Projects",
    ""
  ];

  if (report.projects.length === 0) {
    lines.push("- No matching target project in inventory.");
  } else {
    for (const project of report.projects) {
      lines.push(`- ${project.name || "(unnamed)"} (${project.ref || "-"}): verified=${project.verifiedTarget}, safety=${project.safetyStatus}`);
    }
  }

  lines.push("", "## Next Actions", "");
  for (const action of report.handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetCreateResultEvidence(options = {}) {
  const createRequestEvidence = await readJson(options.targetCreateRequestPath ?? "");
  const connectorReceiptEvidence = await readJson(options.connectorReceiptEvidencePath ?? "");
  const inventoryEvidence = await readJson(options.projectsReportPath ?? "");
  const createRequest = createRequestEvidence.value ?? {};
  const targetName = String(createRequest?.target?.targetName ?? options.expectedTargetName ?? "").trim();
  const inventoryProjects = normalizeProjectInventory(inventoryEvidence.value);
  const projects = inventoryProjects
    .map((project) => normalizeProject(project, targetName))
    .filter((project) => project.targetMatches);
  const targetSafety = evaluateStorageSchemaTargetSafety({ targetName });
  const status = statusFor({ createRequestEvidence, connectorReceiptEvidence, inventoryEvidence, targetSafety, targetProjects: projects });

  const evidence = {
    reportType: "supabase-target-create-result-evidence",
    evidenceVersion: STORAGE_SCHEMA_TARGET_CREATE_RESULT_EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
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
      targetCreateRequestPath: createRequestEvidence.path ? path.basename(createRequestEvidence.path) : "",
      connectorReceiptEvidencePath: connectorReceiptEvidence.path ? path.basename(connectorReceiptEvidence.path) : "",
      projectsReportPath: inventoryEvidence.path ? path.basename(inventoryEvidence.path) : "",
      expectedTargetName: targetName
    },
    sourceEvidence: {
      createRequestStatus: createRequest?.summary?.status ?? (createRequestEvidence.missing ? "missing" : "unknown"),
      connectorReceiptStatus: connectorReceiptEvidence.value?.summary?.status ?? (connectorReceiptEvidence.missing ? "missing" : "unknown"),
      inventoryProjectCount: inventoryProjects.length
    },
    target: {
      organizationId: createRequest?.target?.organizationId ?? "",
      targetName,
      resourceType: createRequest?.selectedCost?.type ?? "",
      region: createRequest?.target?.region ?? ""
    },
    targetSafety,
    projects,
    summary: {
      status,
      verifiedTargetCount: projects.filter((project) => project.verifiedTarget).length,
      readyForSchemaApplyEvidence: false
    },
    readiness: {
      readyForTargetReadinessGate: status === "target_created_inventory_verified",
      reason: status === "target_created_inventory_verified"
        ? "refreshed project inventory contains the requested safe target"
        : "target create result is not verified by refreshed inventory"
    },
    handoff: {
      nextActions: []
    }
  };
  evidence.handoff.nextActions = nextActions(evidence);
  return evidence;
}

export async function writeStorageSchemaTargetCreateResultEvidence(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "supabase-target-create-result-evidence.json");
  const markdownPath = path.join(resolvedOutputDir, "supabase-target-create-result-evidence.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    targetCreateRequestPath: "",
    connectorReceiptEvidencePath: "",
    projectsReportPath: "",
    expectedTargetName: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-create-request") parsed.targetCreateRequestPath = argv[++index] ?? "";
    else if (arg === "--connector-receipt-evidence") parsed.connectorReceiptEvidencePath = argv[++index] ?? "";
    else if (arg === "--projects-report") parsed.projectsReportPath = argv[++index] ?? "";
    else if (arg === "--expected-target-name") parsed.expectedTargetName = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaTargetCreateResultEvidence(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetCreateResultEvidence(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
