#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_USER_COST_CONFIRMATION_EVIDENCE_VERSION = "storage-schema-user-cost-confirmation-evidence/v1";
export const STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS = 24;

const root = process.cwd();
const MS_PER_HOUR = 60 * 60 * 1000;

function isInsideDirectory(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toProjectRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
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

function selectedCost(costPackage) {
  const resource = costPackage?.inputs?.preferredResource ?? "";
  return resource ? costPackage?.costEvidence?.[resource] ?? {} : {};
}

function ageHoursSince(isoDate, now = Date.now()) {
  const timestamp = Date.parse(String(isoDate ?? ""));
  if (!Number.isFinite(timestamp)) return null;
  const ageHours = (now - timestamp) / MS_PER_HOUR;
  return ageHours >= 0 ? ageHours : null;
}

function packageFresh(costPackage) {
  const ageHours = ageHoursSince(costPackage?.generatedAt);
  return ageHours !== null && ageHours <= STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS;
}

function statusFor({ costEvidence, expectedConfirmationText, providedConfirmationText, confirmedBy }) {
  if (costEvidence.missing) return "blocked_missing_cost_confirmation_package";
  const report = costEvidence.value;
  if (report?.reportType !== "file-storage-schema-target-cost-confirmation-package") return "blocked_invalid_cost_confirmation_package";
  if (report?.summary?.status !== "ready_for_user_cost_confirmation") return "blocked_cost_package_not_ready";
  if (!packageFresh(report)) return "blocked_stale_cost_confirmation_package";
  if (!expectedConfirmationText) return "blocked_missing_expected_confirmation_text";
  if (!providedConfirmationText) return "blocked_missing_user_confirmation";
  if (normalizeText(providedConfirmationText) !== normalizeText(expectedConfirmationText)) return "blocked_confirmation_text_mismatch";
  if (!normalizeText(confirmedBy)) return "blocked_missing_confirmed_by";
  return "confirmed";
}

function nextActions(report) {
  if (report.summary.status === "confirmed") {
    return [
      "Use this evidence with storage:schema-formal-review-package as --user-cost-confirmed-evidence",
      "Call Supabase confirm_cost only after confirming this evidence still matches the latest cost package"
    ];
  }
  if (report.summary.status === "blocked_missing_cost_confirmation_package") {
    return ["Generate storage:schema-target-cost-confirmation-package with current Supabase get_cost values first"];
  }
  if (report.summary.status === "blocked_stale_cost_confirmation_package") {
    return ["Regenerate storage:schema-target-cost-confirmation-package with fresh Supabase get_cost values before asking for confirmation"];
  }
  if (report.summary.status === "blocked_confirmation_text_mismatch") {
    return ["Repeat the exact confirmation text from the cost package and ask the user to confirm that exact wording"];
  }
  return ["Collect explicit user confirmation evidence before calling Supabase confirm_cost or creating a target"];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Target User Cost Confirmation Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence version: ${report.evidenceVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Confirmation recorded: ${report.confirmationRecorded}`,
    `- Target name: ${report.targetName || "-"}`,
    `- Resource type: ${report.resourceType || "-"}`,
    `- Cost: ${report.cost.amount ?? "-"} ${report.cost.recurrence || ""}`.trim(),
    `- Cost package fresh: ${report.summary.costPackageFresh}`,
    `- Max confirmation package age hours: ${report.summary.maxCostConfirmationPackageAgeHours}`,
    "",
    "## Guardrails",
    "",
    `- No Supabase confirm cost called: ${report.assumptions.noSupabaseConfirmCostCalled}`,
    `- No Supabase project created: ${report.assumptions.noSupabaseProjectCreated}`,
    `- No Supabase branch created: ${report.assumptions.noSupabaseBranchCreated}`,
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    "",
    "## Confirmation Text",
    "",
    `- Expected: ${report.expectedConfirmationText || "-"}`,
    `- Provided matches expected: ${report.summary.providedTextMatchesExpected}`,
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

export async function buildStorageSchemaUserCostConfirmationEvidence(options = {}) {
  const costEvidence = await readInputJson(options.costConfirmationPackagePath ?? "");
  const report = costEvidence.value ?? {};
  const cost = selectedCost(report);
  const expectedConfirmationText = String(report?.handoff?.confirmationText ?? "");
  const providedConfirmationText = String(options.confirmationText ?? "");
  const confirmedBy = normalizeText(options.confirmedBy);
  const status = statusFor({ costEvidence, expectedConfirmationText, providedConfirmationText, confirmedBy });
  const confirmationRecorded = status === "confirmed";

  const evidence = {
    reportType: "supabase-target-user-cost-confirmation-evidence",
    evidenceVersion: STORAGE_SCHEMA_USER_COST_CONFIRMATION_EVIDENCE_VERSION,
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
      confirmedBy,
      confirmationTextProvided: Boolean(normalizeText(providedConfirmationText))
    },
    costPackage: {
      status: report?.summary?.status ?? (costEvidence.missing ? "missing" : "unknown"),
      reportType: report?.reportType ?? "",
      packageVersion: report?.packageVersion ?? "",
      generatedAt: report?.generatedAt ?? "",
      targetName: report?.inputs?.targetName ?? "",
      resourceType: report?.inputs?.preferredResource ?? "",
      selectedCostAmount: cost?.amount ?? null,
      selectedCostRecurrence: cost?.recurrence ?? "",
      confirmationText: expectedConfirmationText
    },
    targetName: report?.inputs?.targetName ?? "",
    resourceType: report?.inputs?.preferredResource ?? "",
    confirmationRecorded,
    confirmedBy: confirmationRecorded ? confirmedBy : "",
    confirmedAt: confirmationRecorded ? new Date().toISOString() : "",
    cost: {
      amount: cost?.amount ?? null,
      recurrence: cost?.recurrence ?? ""
    },
    expectedConfirmationText,
    summary: {
      status,
      costPackageFresh: costEvidence.missing ? false : packageFresh(report),
      maxCostConfirmationPackageAgeHours: STORAGE_SCHEMA_COST_CONFIRMATION_MAX_AGE_HOURS,
      providedTextMatchesExpected: Boolean(
        normalizeText(providedConfirmationText) &&
          normalizeText(providedConfirmationText) === normalizeText(expectedConfirmationText)
      ),
      readyForSupabaseConfirmCost: confirmationRecorded,
      readyForSupabaseCreateCall: false
    },
    handoff: {
      nextActions: []
    }
  };
  evidence.handoff.nextActions = nextActions(evidence);
  return evidence;
}

export async function writeStorageSchemaUserCostConfirmationEvidence(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "user-cost-confirmation-evidence.json");
  const markdownPath = path.join(resolvedOutputDir, "user-cost-confirmation-evidence.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    costConfirmationPackagePath: "",
    confirmationText: "",
    confirmedBy: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cost-confirmation-package") parsed.costConfirmationPackagePath = argv[++index] ?? "";
    else if (arg === "--confirmation-text") parsed.confirmationText = argv[++index] ?? "";
    else if (arg === "--confirmed-by") parsed.confirmedBy = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaUserCostConfirmationEvidence(args);
  if (args.outputDir) {
    await writeStorageSchemaUserCostConfirmationEvidence(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
