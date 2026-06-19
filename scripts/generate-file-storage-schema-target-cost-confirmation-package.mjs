#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";

export const STORAGE_SCHEMA_TARGET_COST_CONFIRMATION_PACKAGE_VERSION = "storage-schema-target-cost-confirmation-package/v1";

const RESOURCE_TYPES = ["project", "branch"];

function normalizeRecurrence(value, fallback = "") {
  const recurrence = String(value ?? fallback).trim().toLowerCase();
  if (recurrence === "monthly" || recurrence === "hourly") return recurrence;
  return "";
}

function normalizeAmount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function costEntry(type, amount, recurrence) {
  return {
    type,
    amount,
    recurrence,
    available: amount !== null && Boolean(recurrence),
    requiresUserConfirmationBeforeCreate: true
  };
}

function buildCostEvidence(options) {
  return {
    project: costEntry(
      "project",
      normalizeAmount(options.projectCostAmount),
      normalizeRecurrence(options.projectCostRecurrence, "monthly")
    ),
    branch: costEntry(
      "branch",
      normalizeAmount(options.branchCostAmount),
      normalizeRecurrence(options.branchCostRecurrence, "hourly")
    )
  };
}

function requestedResource(options) {
  const preferred = String(options.preferredResource ?? "").trim().toLowerCase();
  return RESOURCE_TYPES.includes(preferred) ? preferred : "";
}

function summaryStatus({ targetSafety, costEvidence, resource }) {
  if (!targetSafety.safe) return "blocked_unsafe_target";
  if (!resource) return "blocked_missing_resource_choice";
  if (!costEvidence[resource]?.available) return "blocked_missing_cost_evidence";
  return "ready_for_user_cost_confirmation";
}

function nextActions(report) {
  if (report.summary.status === "blocked_unsafe_target") {
    return [
      "Choose a dedicated AI_PDM_STAGING/disposable/shadow target name that is not ProJED, ProJED_TEST, production, or main",
      "Regenerate this package after target name correction"
    ];
  }
  if (report.summary.status === "blocked_missing_resource_choice") {
    return [
      "Choose whether the target should be a new Supabase project or development branch",
      "Regenerate this package with --preferred-resource project or --preferred-resource branch"
    ];
  }
  if (report.summary.status === "blocked_missing_cost_evidence") {
    return [
      "Run Supabase get_cost for the selected organization and resource type",
      "Regenerate this package with the current cost amount and recurrence"
    ];
  }
  const selected = report.costEvidence[report.inputs.preferredResource];
  return [
    `Repeat to the user: creating a Supabase ${selected.type} for ${report.inputs.targetName} costs ${selected.amount} ${selected.recurrence}`,
    "Ask the user to explicitly confirm they understand the cost before calling Supabase confirm_cost",
    "After explicit confirmation, use Supabase confirm_cost and then create the project or branch through the connector"
  ];
}

function confirmationText(report) {
  if (report.summary.status !== "ready_for_user_cost_confirmation") return "";
  const selected = report.costEvidence[report.inputs.preferredResource];
  return `Please confirm you understand creating the Supabase ${selected.type} target "${report.inputs.targetName}" in organization "${report.inputs.organizationId}" costs ${selected.amount} ${selected.recurrence}.`;
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Target Cost Confirmation Package",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Organization ID: ${report.inputs.organizationId || "-"}`,
    `- Target name: ${report.inputs.targetName || "-"}`,
    `- Region: ${report.inputs.region || "-"}`,
    `- Preferred resource: ${report.inputs.preferredResource || "-"}`,
    "",
    "## Cost Evidence",
    "",
    `- Project: available=${report.costEvidence.project.available}, amount=${report.costEvidence.project.amount}, recurrence=${report.costEvidence.project.recurrence || "-"}`,
    `- Branch: available=${report.costEvidence.branch.available}, amount=${report.costEvidence.branch.amount}, recurrence=${report.costEvidence.branch.recurrence || "-"}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No Supabase confirm cost called: ${report.assumptions.noSupabaseConfirmCostCalled}`,
    `- No Supabase project created: ${report.assumptions.noSupabaseProjectCreated}`,
    `- No Supabase branch created: ${report.assumptions.noSupabaseBranchCreated}`,
    "",
    "## Next Actions",
    ""
  ];

  for (const action of report.handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  if (report.handoff.confirmationText) {
    lines.push("", "## User Confirmation Text", "", report.handoff.confirmationText);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildStorageSchemaTargetCostConfirmationPackage(options = {}) {
  const targetName = String(options.targetName ?? "").trim();
  const organizationId = String(options.organizationId ?? "").trim();
  const region = String(options.region ?? "").trim();
  const preferredResource = requestedResource(options);
  const costEvidence = buildCostEvidence(options);
  const targetSafety = evaluateStorageSchemaTargetSafety({ targetName });
  const status = summaryStatus({ targetSafety, costEvidence, resource: preferredResource });
  const report = {
    reportType: "file-storage-schema-target-cost-confirmation-package",
    packageVersion: STORAGE_SCHEMA_TARGET_COST_CONFIRMATION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noSupabaseConfirmCostCalled: true,
      noSupabaseProjectCreated: true,
      noSupabaseBranchCreated: true,
      noCostAccepted: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      organizationId,
      organizationName: String(options.organizationName ?? "").trim(),
      targetName,
      region,
      preferredResource
    },
    targetSafety,
    costEvidence,
    readiness: {
      readyForUserCostConfirmation: status === "ready_for_user_cost_confirmation",
      readyForSupabaseCreateCall: false,
      reason: status === "ready_for_user_cost_confirmation"
        ? "cost evidence is present and target name is safe; explicit user confirmation is still required"
        : "target cost confirmation package is incomplete or unsafe"
    },
    handoff: {
      nextActions: [],
      confirmationText: ""
    },
    summary: {
      status,
      costEvidenceAvailable: Boolean(preferredResource && costEvidence[preferredResource]?.available),
      selectedCostAmount: preferredResource ? costEvidence[preferredResource]?.amount : null,
      selectedCostRecurrence: preferredResource ? costEvidence[preferredResource]?.recurrence : ""
    }
  };
  report.handoff.nextActions = nextActions(report);
  report.handoff.confirmationText = confirmationText(report);
  return report;
}

export async function writeStorageSchemaTargetCostConfirmationPackage(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-target-cost-confirmation-package.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-target-cost-confirmation-package.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    organizationId: "",
    organizationName: "",
    targetName: "",
    region: "",
    preferredResource: "",
    projectCostAmount: "",
    projectCostRecurrence: "monthly",
    branchCostAmount: "",
    branchCostRecurrence: "hourly",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--organization-id") parsed.organizationId = argv[++index] ?? "";
    else if (arg === "--organization-name") parsed.organizationName = argv[++index] ?? "";
    else if (arg === "--target-name") parsed.targetName = argv[++index] ?? "";
    else if (arg === "--region") parsed.region = argv[++index] ?? "";
    else if (arg === "--preferred-resource") parsed.preferredResource = argv[++index] ?? "";
    else if (arg === "--project-cost-amount") parsed.projectCostAmount = argv[++index] ?? "";
    else if (arg === "--project-cost-recurrence") parsed.projectCostRecurrence = argv[++index] ?? "";
    else if (arg === "--branch-cost-amount") parsed.branchCostAmount = argv[++index] ?? "";
    else if (arg === "--branch-cost-recurrence") parsed.branchCostRecurrence = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildStorageSchemaTargetCostConfirmationPackage(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetCostConfirmationPackage(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
