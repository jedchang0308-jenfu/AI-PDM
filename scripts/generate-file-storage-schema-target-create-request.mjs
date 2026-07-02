#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";
import { STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS } from "./generate-file-storage-schema-user-cost-confirmation-evidence.mjs";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_TARGET_CREATE_REQUEST_VERSION = "storage-schema-target-create-request/v1";

const root = process.cwd();
const RESOURCE_TYPES = ["project", "branch"];
const MS_PER_HOUR = 60 * 60 * 1000;

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
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function selectedCost(costPackage) {
  const resourceType = costPackage?.inputs?.preferredResource ?? "";
  return RESOURCE_TYPES.includes(resourceType) ? costPackage?.costEvidence?.[resourceType] ?? {} : {};
}

function costMatches(costPackage, userEvidence) {
  const cost = selectedCost(costPackage);
  return (
    userEvidence?.targetName === costPackage?.inputs?.targetName &&
    userEvidence?.resourceType === costPackage?.inputs?.preferredResource &&
    userEvidence?.cost?.amount === (cost?.amount ?? null) &&
    userEvidence?.cost?.recurrence === (cost?.recurrence ?? "")
  );
}

function ageHoursSince(isoDate, now = Date.now()) {
  const timestamp = Date.parse(String(isoDate ?? ""));
  if (!Number.isFinite(timestamp)) return null;
  const ageHours = (now - timestamp) / MS_PER_HOUR;
  return ageHours >= 0 ? ageHours : null;
}

function isFreshIso(isoDate) {
  const ageHours = ageHoursSince(isoDate);
  return ageHours !== null && ageHours <= STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS;
}

function userConfirmationSourceMatchesCostPackage(costPackage, userConfirmation) {
  return (
    userConfirmation?.costPackage?.reportType === costPackage?.reportType &&
    userConfirmation?.costPackage?.packageVersion === costPackage?.packageVersion &&
    userConfirmation?.costPackage?.generatedAt === costPackage?.generatedAt &&
    userConfirmation?.costPackage?.targetName === costPackage?.inputs?.targetName &&
    userConfirmation?.costPackage?.resourceType === costPackage?.inputs?.preferredResource &&
    normalizeText(userConfirmation?.costPackage?.confirmationText) === normalizeText(costPackage?.handoff?.confirmationText)
  );
}

function statusFor({ costEvidence, userEvidence, sourceProjectId }) {
  const costPackage = costEvidence.value;
  const userConfirmation = userEvidence.value;
  if (costEvidence.missing) return "blocked_missing_cost_confirmation_package";
  if (costPackage?.reportType !== "file-storage-schema-target-cost-confirmation-package") {
    return "blocked_invalid_cost_confirmation_package";
  }
  if (costPackage?.summary?.status !== "ready_for_user_cost_confirmation") return "blocked_cost_package_not_ready";
  if (!costPackage.inputs?.organizationId || !costPackage.inputs?.targetName || !costPackage.inputs?.region) {
    return "blocked_missing_target_create_inputs";
  }
  if (!RESOURCE_TYPES.includes(costPackage.inputs.preferredResource)) return "blocked_missing_resource_choice";
  if (!costPackage.costEvidence?.[costPackage.inputs.preferredResource]?.available) return "blocked_missing_cost_evidence";
  const targetSafety = evaluateStorageSchemaTargetSafety({ targetName: costPackage.inputs.targetName });
  if (!targetSafety.safe) return "blocked_unsafe_target";
  if (userEvidence.missing) return "blocked_missing_user_confirmation_evidence";
  if (userConfirmation?.reportType !== "supabase-target-user-cost-confirmation-evidence") {
    return "blocked_invalid_user_confirmation_evidence";
  }
  if (userConfirmation?.summary?.status !== "confirmed" || userConfirmation?.confirmationRecorded !== true) {
    return "blocked_user_cost_not_confirmed";
  }
  if (!isFreshIso(costPackage?.generatedAt)) return "blocked_stale_cost_confirmation_package";
  if (!isFreshIso(userConfirmation?.confirmedAt)) return "blocked_stale_user_confirmation_evidence";
  if (!costMatches(costPackage, userConfirmation)) return "blocked_user_confirmation_cost_mismatch";
  if (!userConfirmationSourceMatchesCostPackage(costPackage, userConfirmation)) {
    return "blocked_user_confirmation_source_package_mismatch";
  }
  if (costPackage.inputs.preferredResource === "branch" && !normalizeText(sourceProjectId)) {
    return "blocked_missing_source_project_id";
  }
  return "ready_for_supabase_target_create_request";
}

function connectorPlan(report) {
  if (report.summary.status !== "ready_for_supabase_target_create_request") return [];
  const selected = report.selectedCost;
  const steps = [
    {
      order: 1,
      connector: "Supabase",
      operation: "confirm_cost",
      arguments: {
        type: selected.type,
        amount: selected.amount,
        recurrence: selected.recurrence
      },
      outputRequired: "confirm_cost_id"
    }
  ];
  if (selected.type === "project") {
    steps.push({
      order: 2,
      connector: "Supabase",
      operation: "create_project",
      arguments: {
        organization_id: report.target.organizationId,
        name: report.target.targetName,
        region: report.target.region
      },
      requires: "confirm_cost_id from step 1"
    });
  } else {
    steps.push({
      order: 2,
      connector: "Supabase",
      operation: "create_branch",
      arguments: {
        project_id: report.target.sourceProjectId,
        name: report.target.targetName
      },
      requires: "confirm_cost_id from step 1"
    });
  }
  return steps;
}

function nextActions(report) {
  if (report.summary.status === "ready_for_supabase_target_create_request") {
    return [
      "Call Supabase confirm_cost with the selected resource cost only after re-checking this package is still current",
      "Use the returned confirm_cost_id for the matching Supabase create_project or create_branch call",
      "Export Supabase project inventory again after creation and rerun storage:schema-target-readiness-package"
    ];
  }
  if (report.summary.status === "blocked_user_cost_not_confirmed") {
    return ["Collect exact user cost confirmation evidence before calling Supabase confirm_cost"];
  }
  if (report.summary.status === "blocked_missing_user_confirmation_evidence") {
    return ["Generate storage:schema-user-cost-confirmation-evidence from the current cost package first"];
  }
  if (report.summary.status === "blocked_stale_cost_confirmation_package") {
    return ["Regenerate storage:schema-target-cost-confirmation-package with current Supabase get_cost values before connector execution"];
  }
  if (report.summary.status === "blocked_stale_user_confirmation_evidence") {
    return ["Ask the user to reconfirm the current cost package before connector execution"];
  }
  if (report.summary.status === "blocked_user_confirmation_source_package_mismatch") {
    return ["Regenerate user cost confirmation evidence from the same current cost package used by this create request"];
  }
  return ["Regenerate the upstream target cost and user confirmation evidence before connector execution"];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Target Create Request",
    "",
    `Generated at: ${report.generatedAt}`,
    `Request version: ${report.requestVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Ready for connector execution: ${report.readiness.readyForConnectorExecution}`,
    `- Target name: ${report.target.targetName || "-"}`,
    `- Resource type: ${report.selectedCost.type || "-"}`,
    `- Cost: ${report.selectedCost.amount ?? "-"} ${report.selectedCost.recurrence || ""}`.trim(),
    `- Upstream evidence fresh: ${report.readiness.upstreamEvidenceFresh}`,
    `- User confirmation source matches cost package: ${report.summary.userConfirmationSourceMatchesCostPackage}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No Supabase confirm cost called: ${report.assumptions.noSupabaseConfirmCostCalled}`,
    `- No Supabase project created: ${report.assumptions.noSupabaseProjectCreated}`,
    `- No Supabase branch created: ${report.assumptions.noSupabaseBranchCreated}`,
    "",
    "## Connector Plan",
    ""
  ];

  if (report.connectorPlan.length === 0) {
    lines.push("- Not available until upstream evidence passes.");
  } else {
    for (const step of report.connectorPlan) {
      lines.push(`- Step ${step.order}: ${step.connector}.${step.operation}`);
    }
  }

  lines.push("", "## Next Actions", "");
  for (const action of report.handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetCreateRequest(options = {}) {
  const costEvidence = await readInputJson(options.costConfirmationPackagePath ?? "");
  const userEvidence = await readInputJson(options.userCostConfirmedEvidencePath ?? "");
  const costPackage = costEvidence.value ?? {};
  const cost = selectedCost(costPackage);
  const sourceProjectId = normalizeText(options.sourceProjectId);
  const status = statusFor({ costEvidence, userEvidence, sourceProjectId });
  const report = {
    reportType: "supabase-target-create-request",
    requestVersion: STORAGE_SCHEMA_TARGET_CREATE_REQUEST_VERSION,
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
      costConfirmationPackagePath: costEvidence.path ? path.basename(costEvidence.path) : "",
      userCostConfirmedEvidencePath: userEvidence.path ? path.basename(userEvidence.path) : "",
      sourceProjectId
    },
    sourceEvidence: {
      costPackageStatus: costPackage?.summary?.status ?? (costEvidence.missing ? "missing" : "unknown"),
      costPackageGeneratedAt: costPackage?.generatedAt ?? "",
      userCostConfirmationStatus: userEvidence.value?.summary?.status ?? (userEvidence.missing ? "missing" : "unknown"),
      userCostConfirmationGeneratedAt: userEvidence.value?.generatedAt ?? "",
      userCostConfirmationConfirmedAt: userEvidence.value?.confirmedAt ?? "",
      userCostConfirmationSourceCostPackageGeneratedAt: userEvidence.value?.costPackage?.generatedAt ?? "",
      userConfirmationRecorded: userEvidence.value?.confirmationRecorded === true
    },
    target: {
      organizationId: costPackage?.inputs?.organizationId ?? "",
      organizationName: costPackage?.inputs?.organizationName ?? "",
      targetName: costPackage?.inputs?.targetName ?? "",
      region: costPackage?.inputs?.region ?? "",
      sourceProjectId
    },
    selectedCost: {
      type: costPackage?.inputs?.preferredResource ?? "",
      amount: cost?.amount ?? null,
      recurrence: cost?.recurrence ?? ""
    },
    targetSafety: evaluateStorageSchemaTargetSafety({ targetName: costPackage?.inputs?.targetName ?? "" }),
    summary: {
      status,
      readyForSupabaseConfirmCost: status === "ready_for_supabase_target_create_request",
      readyForSupabaseCreateCall: false,
      costMatchesUserConfirmation: Boolean(costPackage?.inputs?.preferredResource && userEvidence.value && costMatches(costPackage, userEvidence.value)),
      costPackageFresh: Boolean(costPackage?.generatedAt && isFreshIso(costPackage.generatedAt)),
      userConfirmationFresh: Boolean(userEvidence.value?.confirmedAt && isFreshIso(userEvidence.value.confirmedAt)),
      maxCostConfirmationPackageAgeHours: STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS,
      userConfirmationSourceMatchesCostPackage: Boolean(
        costPackage?.reportType &&
          userEvidence.value &&
          userConfirmationSourceMatchesCostPackage(costPackage, userEvidence.value)
      )
    },
    readiness: {
      readyForConnectorExecution: status === "ready_for_supabase_target_create_request",
      upstreamEvidenceFresh: Boolean(
        costPackage?.generatedAt &&
          userEvidence.value?.confirmedAt &&
          isFreshIso(costPackage.generatedAt) &&
          isFreshIso(userEvidence.value.confirmedAt)
      ),
      reason: status === "ready_for_supabase_target_create_request"
        ? "cost package and explicit user confirmation evidence are clean; connector confirm_cost must still be called before create"
        : "target create request is blocked by missing or failed upstream evidence"
    },
    connectorPlan: [],
    handoff: {
      nextActions: []
    }
  };
  report.connectorPlan = connectorPlan(report);
  report.handoff.nextActions = nextActions(report);
  return report;
}

export async function writeStorageSchemaTargetCreateRequest(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "supabase-target-create-request.json");
  const markdownPath = path.join(resolvedOutputDir, "supabase-target-create-request.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    costConfirmationPackagePath: "",
    userCostConfirmedEvidencePath: "",
    sourceProjectId: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cost-confirmation-package") parsed.costConfirmationPackagePath = argv[++index] ?? "";
    else if (arg === "--user-cost-confirmed-evidence") parsed.userCostConfirmedEvidencePath = argv[++index] ?? "";
    else if (arg === "--source-project-id") parsed.sourceProjectId = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaTargetCreateRequest(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetCreateRequest(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
