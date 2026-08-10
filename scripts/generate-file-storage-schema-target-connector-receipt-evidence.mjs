#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_TARGET_CONNECTOR_RECEIPT_EVIDENCE_VERSION = "storage-schema-target-connector-receipt-evidence/v1";

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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function statusFor({ createRequestEvidence, confirmCostId, createdResourceId, createdResourceType, createdTargetName, createdRegion }) {
  const createRequest = createRequestEvidence.value;
  if (createRequestEvidence.missing) return "blocked_missing_target_create_request";
  if (createRequest?.reportType !== "supabase-target-create-request") return "blocked_invalid_target_create_request";
  if (createRequest?.summary?.status !== "ready_for_supabase_target_create_request") return "blocked_create_request_not_ready";
  if (!normalizeText(confirmCostId)) return "blocked_missing_confirm_cost_receipt";
  if (!normalizeText(createdResourceId)) return "blocked_missing_create_receipt";
  if (createdResourceType !== createRequest?.selectedCost?.type) return "blocked_create_receipt_mismatch";
  if (createdTargetName !== createRequest?.target?.targetName) return "blocked_create_receipt_mismatch";
  if (createdResourceType === "project" && createdRegion && createdRegion !== createRequest?.target?.region) {
    return "blocked_create_receipt_mismatch";
  }
  const targetSafety = evaluateStorageSchemaTargetSafety({ targetName: createdTargetName });
  if (!targetSafety.safe) return "blocked_unsafe_created_target";
  return "connector_execution_receipt_recorded";
}

function nextActions(report) {
  if (report.summary.status === "connector_execution_receipt_recorded") {
    return [
      "Export Supabase project inventory after connector execution",
      "Use this evidence with storage:schema-target-create-result-evidence before schema apply"
    ];
  }
  if (report.summary.status === "blocked_create_request_not_ready") {
    return ["Do not call Supabase confirm_cost or create APIs until target create request is ready"];
  }
  return ["Record confirm_cost and create_project/create_branch receipts after connector execution"];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Target Connector Receipt Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence version: ${report.evidenceVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Receipt recorded: ${report.summary.receiptRecorded}`,
    `- Target name: ${report.target.targetName || "-"}`,
    `- Resource type: ${report.target.resourceType || "-"}`,
    `- Created resource ID/ref: ${report.receipts.createdResourceId || "-"}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- Generator did not call Supabase confirm cost: ${report.assumptions.generatorDidNotCallSupabaseConfirmCost}`,
    `- Generator did not create project: ${report.assumptions.generatorDidNotCreateProject}`,
    `- Generator did not create branch: ${report.assumptions.generatorDidNotCreateBranch}`,
    "",
    "## Next Actions",
    ""
  ];

  for (const action of report.handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetConnectorReceiptEvidence(options = {}) {
  const createRequestEvidence = await readInputJson(options.targetCreateRequestPath ?? "");
  const createRequest = createRequestEvidence.value ?? {};
  const createdResourceType = normalizeText(options.createdResourceType || createRequest?.selectedCost?.type);
  const createdTargetName = normalizeText(options.createdTargetName || createRequest?.target?.targetName);
  const createdRegion = normalizeText(options.createdRegion || createRequest?.target?.region);
  const confirmCostId = normalizeText(options.confirmCostId);
  const createdResourceId = normalizeText(options.createdResourceId);
  const status = statusFor({
    createRequestEvidence,
    confirmCostId,
    createdResourceId,
    createdResourceType,
    createdTargetName,
    createdRegion
  });
  const receiptRecorded = status === "connector_execution_receipt_recorded";

  const evidence = {
    reportType: "supabase-target-connector-receipt-evidence",
    evidenceVersion: STORAGE_SCHEMA_TARGET_CONNECTOR_RECEIPT_EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      generatorDidNotCallSupabaseConfirmCost: true,
      generatorDidNotCreateProject: true,
      generatorDidNotCreateBranch: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      targetCreateRequestPath: createRequestEvidence.path ? path.basename(createRequestEvidence.path) : "",
      confirmCostIdProvided: Boolean(confirmCostId),
      createdResourceIdProvided: Boolean(createdResourceId)
    },
    sourceEvidence: {
      createRequestStatus: createRequest?.summary?.status ?? (createRequestEvidence.missing ? "missing" : "unknown")
    },
    target: {
      organizationId: createRequest?.target?.organizationId ?? "",
      targetName: createdTargetName,
      resourceType: createdResourceType,
      region: createdRegion
    },
    receipts: {
      confirmCostId,
      createdResourceId,
      createdResourceType,
      createdTargetName,
      createdRegion
    },
    targetSafety: evaluateStorageSchemaTargetSafety({ targetName: createdTargetName }),
    summary: {
      status,
      receiptRecorded,
      readyForCreateResultEvidence: receiptRecorded
    },
    handoff: {
      nextActions: []
    }
  };
  evidence.handoff.nextActions = nextActions(evidence);
  return evidence;
}

export async function writeStorageSchemaTargetConnectorReceiptEvidence(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "supabase-target-connector-receipt-evidence.json");
  const markdownPath = path.join(resolvedOutputDir, "supabase-target-connector-receipt-evidence.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    targetCreateRequestPath: "",
    confirmCostId: "",
    createdResourceId: "",
    createdResourceType: "",
    createdTargetName: "",
    createdRegion: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-create-request") parsed.targetCreateRequestPath = argv[++index] ?? "";
    else if (arg === "--confirm-cost-id") parsed.confirmCostId = argv[++index] ?? "";
    else if (arg === "--created-resource-id") parsed.createdResourceId = argv[++index] ?? "";
    else if (arg === "--created-resource-type") parsed.createdResourceType = argv[++index] ?? "";
    else if (arg === "--created-target-name") parsed.createdTargetName = argv[++index] ?? "";
    else if (arg === "--created-region") parsed.createdRegion = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaTargetConnectorReceiptEvidence(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetConnectorReceiptEvidence(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
