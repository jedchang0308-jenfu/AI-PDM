#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_FORMAL_REVIEW_PACKAGE_VERSION = "storage-schema-formal-review-package/v1";

const root = process.cwd();

function isInsideDirectory(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toProjectRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function buildCheck(name, passed, detail = "") {
  return { name, passed: Boolean(passed), detail };
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

function evaluateTargetReadiness(evidence) {
  if (evidence.missing) {
    return {
      summary: { status: "missing", targetName: "" },
      checks: [buildCheck("target readiness package is present", false, evidence.error || "missing target readiness package")],
      blockers: ["missing target readiness package"]
    };
  }

  const report = evidence.value;
  const isPackage = report?.reportType === "file-storage-schema-target-readiness-package";
  const isReadiness = report?.reportType === "file-storage-schema-target-readiness";
  const status = report?.summary?.status ?? "unknown";
  const targetName = isPackage
    ? report?.inputs?.expectedTargetName ?? report?.sourceReadiness?.inputs?.expectedTargetName ?? ""
    : report?.inputs?.expectedTargetName ?? "";
  const ready = (isPackage && status === "ready_for_schema_apply_handoff" && report?.readiness?.readyForSchemaApplyGate === true) ||
    (isReadiness && status === "ready_for_storage_schema_apply_gate" && report?.readiness?.readyForStorageSchemaApplyGate === true);

  const checks = [
    buildCheck("target readiness package is present", true),
    buildCheck("target readiness report type is valid", isPackage || isReadiness, report?.reportType ?? ""),
    buildCheck("target readiness status is ready", ready, status),
    buildCheck("target readiness avoided database connection", report?.assumptions?.noDatabaseConnection === true),
    buildCheck("target readiness avoided project creation", report?.assumptions?.noSupabaseProjectCreated === true)
  ];

  return {
    summary: { status, targetName },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `target readiness failed: ${check.name}`)
  };
}

function evaluateCostConfirmationPackage(evidence) {
  if (evidence.missing) {
    return {
      summary: { status: "missing", targetName: "", resourceType: "", amount: null, recurrence: "" },
      checks: [buildCheck("cost confirmation package is present", false, evidence.error || "missing cost confirmation package")],
      blockers: ["missing cost confirmation package"]
    };
  }

  const report = evidence.value;
  const cost = selectedCost(report);
  const status = report?.summary?.status ?? "unknown";
  const resourceType = report?.inputs?.preferredResource ?? "";
  const checks = [
    buildCheck("cost confirmation package is present", true),
    buildCheck("cost confirmation report type is valid", report?.reportType === "file-storage-schema-target-cost-confirmation-package", report?.reportType ?? ""),
    buildCheck("cost package is ready for user confirmation", status === "ready_for_user_cost_confirmation", status),
    buildCheck("selected cost evidence is available", cost?.available === true),
    buildCheck("cost package did not create resources", report?.readiness?.readyForSupabaseCreateCall === false && report?.assumptions?.noSupabaseProjectCreated === true && report?.assumptions?.noSupabaseBranchCreated === true)
  ];

  return {
    summary: {
      status,
      targetName: report?.inputs?.targetName ?? "",
      resourceType,
      amount: cost?.amount ?? null,
      recurrence: cost?.recurrence ?? ""
    },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `cost confirmation package failed: ${check.name}`)
  };
}

function evaluateUserCostConfirmation(evidence, costSummary) {
  if (evidence.missing) {
    return {
      summary: { status: "missing", confirmationRecorded: false },
      checks: [buildCheck("user cost confirmation evidence is present", false, evidence.error || "missing user cost confirmation evidence")],
      blockers: ["missing user cost confirmation evidence"]
    };
  }

  const report = evidence.value;
  const checks = [
    buildCheck("user cost confirmation evidence is present", true),
    buildCheck("user cost confirmation report type is valid", report?.reportType === "supabase-target-user-cost-confirmation-evidence", report?.reportType ?? ""),
    buildCheck("user confirmation is recorded", report?.confirmationRecorded === true),
    buildCheck("confirmation target matches cost package", String(report?.targetName ?? "") === String(costSummary.targetName ?? ""), `${report?.targetName ?? ""} / ${costSummary.targetName ?? ""}`),
    buildCheck("confirmation resource matches cost package", String(report?.resourceType ?? "") === String(costSummary.resourceType ?? ""), `${report?.resourceType ?? ""} / ${costSummary.resourceType ?? ""}`),
    buildCheck("confirmation cost matches cost package", Number(report?.cost?.amount) === Number(costSummary.amount) && String(report?.cost?.recurrence ?? "") === String(costSummary.recurrence ?? ""))
  ];

  return {
    summary: {
      status: checks.every((check) => check.passed) ? "confirmed" : "failed",
      confirmationRecorded: report?.confirmationRecorded === true,
      targetName: report?.targetName ?? "",
      resourceType: report?.resourceType ?? ""
    },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `user cost confirmation failed: ${check.name}`)
  };
}

function evaluateTargetCreateResult(evidence, targetSummary) {
  if (evidence.missing) {
    return {
      summary: { status: "missing", verifiedTargetCount: 0 },
      checks: [buildCheck("target create result evidence is present", false, evidence.error || "missing target create result evidence")],
      blockers: ["missing target create result evidence"]
    };
  }

  const report = evidence.value;
  const status = report?.summary?.status ?? "unknown";
  const checks = [
    buildCheck("target create result evidence is present", true),
    buildCheck("target create result report type is valid", report?.reportType === "supabase-target-create-result-evidence", report?.reportType ?? ""),
    buildCheck("target create result is verified", status === "target_created_inventory_verified", status),
    buildCheck("target create result has verified target", Number(report?.summary?.verifiedTargetCount ?? 0) > 0),
    buildCheck("target create result matches readiness target", String(report?.target?.targetName ?? "") === String(targetSummary.targetName ?? ""), `${report?.target?.targetName ?? ""} / ${targetSummary.targetName ?? ""}`),
    buildCheck("target create result avoided database connection", report?.assumptions?.noDatabaseConnection === true),
    buildCheck("target create result avoided SQL apply", report?.assumptions?.noSqlApplied === true)
  ];

  return {
    summary: {
      status,
      targetName: report?.target?.targetName ?? "",
      verifiedTargetCount: report?.summary?.verifiedTargetCount ?? 0
    },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `target create result failed: ${check.name}`)
  };
}

function evaluatePromotionGate(evidence) {
  if (evidence.missing) {
    return {
      summary: { status: "missing" },
      checks: [buildCheck("schema promotion report is present", false, evidence.error || "missing schema promotion report")],
      blockers: ["missing schema promotion report"]
    };
  }

  const report = evidence.value;
  const status = report?.summary?.status ?? "unknown";
  const checks = [
    buildCheck("schema promotion report is present", true),
    buildCheck("schema promotion report type is valid", report?.reportType === "file-storage-schema-promotion-gate", report?.reportType ?? ""),
    buildCheck("schema promotion status is ready", status === "ready_for_formal_migration_review", status),
    buildCheck("schema promotion readiness is true", report?.readiness?.readyForFormalMigrationReview === true),
    buildCheck("schema promotion avoided database mutation", report?.assumptions?.noSqlApplied === true && report?.assumptions?.noOfficialMigrationFilesWritten === true)
  ];

  return {
    summary: { status },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `schema promotion failed: ${check.name}`)
  };
}

function statusFor(results) {
  const missingCoreEvidence = [
    ...results.target.blockers,
    ...results.cost.blockers,
    ...results.targetCreateResult.blockers,
    ...results.promotion.blockers
  ].some((blocker) => blocker.startsWith("missing"));
  if (missingCoreEvidence) return "blocked_missing_evidence";
  if (results.target.blockers.length > 0) return "blocked_target_readiness";
  if (results.cost.blockers.length > 0 || results.userCost.blockers.length > 0) return "blocked_cost_confirmation";
  if (results.targetCreateResult.blockers.length > 0) return "blocked_target_provisioning_result";
  if (results.promotion.blockers.length > 0) return "blocked_schema_promotion";
  return "ready_for_formal_migration_review";
}

function nextActions(report) {
  if (report.summary.status === "blocked_missing_evidence") {
    return [
      "Collect target readiness package, cost confirmation package, user cost confirmation evidence, target create result evidence, and schema promotion report",
      "Regenerate this formal review package after all evidence files exist"
    ];
  }
  if (report.summary.status === "blocked_target_readiness") {
    return [
      "Use only a dedicated AI_PDM staging/disposable/shadow target",
      "Regenerate target readiness evidence before schema apply or review"
    ];
  }
  if (report.summary.status === "blocked_cost_confirmation") {
    return [
      "Repeat the selected Supabase project or branch cost to the user",
      "Record explicit user confirmation evidence before proceeding"
    ];
  }
  if (report.summary.status === "blocked_target_provisioning_result") {
    return [
      "Record connector receipt evidence and refreshed project inventory for the created target",
      "Regenerate target create result evidence before formal migration review"
    ];
  }
  if (report.summary.status === "blocked_schema_promotion") {
    return [
      "Resolve apply, verify, or Supabase advisor evidence blockers",
      "Regenerate the schema promotion gate after clean evidence is available"
    ];
  }
  return [
    "Submit the bundled evidence to formal migration review",
    "Keep production migration blocked until reviewer approval and rollback plan are recorded"
  ];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Formal Review Package",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Ready for formal migration review: ${report.readiness.readyForFormalMigrationReview}`,
    `- Passed checks: ${report.summary.passedCheckCount}`,
    `- Blocker count: ${report.summary.blockerCount}`,
    "",
    "## Source Evidence",
    "",
    `- Target readiness: ${report.sourceEvidence.targetReadiness.status}`,
    `- Cost confirmation package: ${report.sourceEvidence.costConfirmation.status}`,
    `- User cost confirmation: ${report.sourceEvidence.userCostConfirmation.status}`,
    `- Target create result: ${report.sourceEvidence.targetCreateResult.status}`,
    `- Schema promotion: ${report.sourceEvidence.schemaPromotion.status}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No SQL applied: ${report.assumptions.noSqlApplied}`,
    `- No official migration files written: ${report.assumptions.noOfficialMigrationFilesWritten}`,
    `- No Supabase project or branch created: ${report.assumptions.noSupabaseResourceCreated}`,
    "",
    "## Checks",
    ""
  ];

  for (const check of report.checks) {
    lines.push(`- ${check.name}: ${check.passed ? "pass" : "fail"}${check.detail ? ` - ${check.detail}` : ""}`);
  }

  if (report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("", "## Next Actions", "");
  for (const action of report.handoff.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaFormalReviewPackage(options = {}) {
  const targetEvidence = await readInputJson(options.targetReadinessPackagePath ?? "");
  const costEvidence = await readInputJson(options.costConfirmationPackagePath ?? "");
  const targetCreateResultEvidence = await readInputJson(options.targetCreateResultEvidencePath ?? "");
  const promotionEvidence = await readInputJson(options.promotionReportPath ?? "");

  const target = evaluateTargetReadiness(targetEvidence);
  const cost = evaluateCostConfirmationPackage(costEvidence);
  const userCostEvidence = await readInputJson(options.userCostConfirmedEvidencePath ?? "");
  const userCost = evaluateUserCostConfirmation(userCostEvidence, cost.summary);
  const targetCreateResult = evaluateTargetCreateResult(targetCreateResultEvidence, target.summary);
  const promotion = evaluatePromotionGate(promotionEvidence);
  const results = { target, cost, userCost, targetCreateResult, promotion };
  const checks = [...target.checks, ...cost.checks, ...userCost.checks, ...targetCreateResult.checks, ...promotion.checks];
  const blockers = [...target.blockers, ...cost.blockers, ...userCost.blockers, ...targetCreateResult.blockers, ...promotion.blockers];
  const status = statusFor(results);

  const report = {
    reportType: "file-storage-schema-formal-review-package",
    packageVersion: STORAGE_SCHEMA_FORMAL_REVIEW_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true,
      noSupabaseResourceCreated: true,
      userCostConfirmationEvidenceRequired: true,
      targetCreateResultEvidenceRequired: true,
      reviewerApprovalStillRequired: true
    },
    inputs: {
      targetReadinessPackagePath: targetEvidence.path ? path.basename(targetEvidence.path) : "",
      costConfirmationPackagePath: costEvidence.path ? path.basename(costEvidence.path) : "",
      userCostConfirmedEvidencePath: userCostEvidence.path ? path.basename(userCostEvidence.path) : "",
      targetCreateResultEvidencePath: targetCreateResultEvidence.path ? path.basename(targetCreateResultEvidence.path) : "",
      promotionReportPath: promotionEvidence.path ? path.basename(promotionEvidence.path) : ""
    },
    sourceEvidence: {
      targetReadiness: target.summary,
      costConfirmation: cost.summary,
      userCostConfirmation: userCost.summary,
      targetCreateResult: targetCreateResult.summary,
      schemaPromotion: promotion.summary
    },
    readiness: {
      readyForFormalMigrationReview: status === "ready_for_formal_migration_review",
      reason: status === "ready_for_formal_migration_review"
        ? "target readiness, cost confirmation, explicit user cost confirmation, target create result, and schema promotion evidence are all clean"
        : "formal migration review evidence is missing or blocked"
    },
    summary: {
      status,
      passedCheckCount: checks.filter((check) => check.passed).length,
      blockerCount: blockers.length
    },
    checks,
    blockers,
    handoff: {
      nextActions: []
    }
  };
  report.handoff.nextActions = nextActions(report);
  return report;
}

export async function writeStorageSchemaFormalReviewPackage(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-formal-review-package.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-formal-review-package.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    targetReadinessPackagePath: "",
    costConfirmationPackagePath: "",
    userCostConfirmedEvidencePath: "",
    targetCreateResultEvidencePath: "",
    promotionReportPath: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target-readiness-package" || arg === "--target-readiness-report") parsed.targetReadinessPackagePath = argv[++index] ?? "";
    else if (arg === "--cost-confirmation-package") parsed.costConfirmationPackagePath = argv[++index] ?? "";
    else if (arg === "--user-cost-confirmed-evidence") parsed.userCostConfirmedEvidencePath = argv[++index] ?? "";
    else if (arg === "--target-create-result-evidence") parsed.targetCreateResultEvidencePath = argv[++index] ?? "";
    else if (arg === "--promotion-report") parsed.promotionReportPath = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaFormalReviewPackage(args);
  if (args.outputDir) {
    await writeStorageSchemaFormalReviewPackage(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
