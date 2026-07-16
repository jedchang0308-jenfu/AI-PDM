#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  STORAGE_SCHEMA_TARGET_READINESS_VERSION,
  buildStorageSchemaTargetReadiness,
  writeStorageSchemaTargetReadiness
} from "./generate-file-storage-schema-target-readiness.mjs";

export const STORAGE_SCHEMA_TARGET_READINESS_PACKAGE_VERSION = "storage-schema-target-readiness-package/v1";

function commandSet(expectedTargetName) {
  const targetArg = expectedTargetName || "AI_PDM_STAGING";
  return [
    `npm.cmd run storage:schema-target-readiness -- --projects-report <projects.json> --expected-target-name ${targetArg} --output <evidence-dir>`,
    `set PDM_STORAGE_SCHEMA_APPLY_ENABLED=1 && set PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL=<dedicated-target-url> && npm.cmd run storage:schema-apply-gate -- --target-name ${targetArg} --confirm-disposable --output <evidence-dir>`,
    `set PDM_STORAGE_SCHEMA_VERIFY_ENABLED=1 && set PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL=<dedicated-target-url> && npm.cmd run storage:schema-verify-gate -- --target-name ${targetArg} --confirm-target --output <evidence-dir>`,
    `npm.cmd run storage:schema-advisor-evidence -- --security-report <security-advisor.json> --performance-report <performance-advisor.json> --target-name ${targetArg} --output <evidence-dir>`,
    "npm.cmd run storage:schema-promotion-gate -- --apply-report <storage-schema-apply-gate.json> --verify-report <storage-schema-verify-gate.json> --advisor-evidence <supabase-advisor-evidence.json> --output <evidence-dir>"
  ];
}

function requiredExternalInputs(readinessReport) {
  if (!readinessReport.readiness.readyForStorageSchemaApplyGate) {
    return [
      "Dedicated AI_PDM_STAGING or disposable/shadow Supabase target inventory",
      "User-approved Supabase project or branch cost when a new target must be created",
      "Dedicated target database URL after the target exists"
    ];
  }

  return [
    "Dedicated target database URL",
    "Supabase security advisor JSON export",
    "Supabase performance advisor JSON export",
    "Formal migration review approval after promotion gate is ready"
  ];
}

function blockedActions(readinessReport) {
  if (readinessReport.summary.status === "blocked_missing_project_inventory") {
    return [
      "Export Supabase project inventory from the connector or dashboard",
      "Run storage:schema-target-readiness with the exported inventory"
    ];
  }
  if (readinessReport.summary.status === "blocked_unsafe_expected_target") {
    return [
      "Choose a target name that is not production-like and not ProJED / ProJED_TEST",
      "Use a dedicated AI_PDM staging/disposable/shadow target"
    ];
  }
  if (readinessReport.summary.status === "blocked_no_approved_target") {
    return [
      "Do not use ProJED or ProJED_TEST for AI_PDM storage schema validation",
      "Create or provide a dedicated AI_PDM_STAGING/disposable/shadow target",
      "Re-export project inventory after the target exists"
    ];
  }
  return [];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Target Readiness Package",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    `Readiness gate version: ${report.readinessGateVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Ready for schema apply gate: ${report.readiness.readyForSchemaApplyGate}`,
    `- Expected target name: ${report.inputs.expectedTargetName || "-"}`,
    `- Project count: ${report.sourceReadiness.summary.projectCount}`,
    `- Ready candidate count: ${report.sourceReadiness.summary.readyCandidateCount}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No Supabase project created: ${report.assumptions.noSupabaseProjectCreated}`,
    `- No cost accepted: ${report.assumptions.noCostAccepted}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No SQL applied: ${report.assumptions.noSqlApplied}`,
    "",
    "## Required External Inputs",
    ""
  ];

  for (const item of report.handoff.requiredExternalInputs) {
    lines.push(`- ${item}`);
  }

  if (report.handoff.blockedActions.length > 0) {
    lines.push("", "## Blocked Actions", "");
    for (const item of report.handoff.blockedActions) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "## Next Commands", "");
  for (const command of report.handoff.nextCommands) {
    lines.push(`- \`${command}\``);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetReadinessPackage(options = {}) {
  const readinessReport = await buildStorageSchemaTargetReadiness({
    projectsReportPath: options.projectsReportPath ?? "",
    expectedTargetName: options.expectedTargetName ?? ""
  });
  const ready = readinessReport.readiness.readyForStorageSchemaApplyGate;

  return {
    reportType: "file-storage-schema-target-readiness-package",
    packageVersion: STORAGE_SCHEMA_TARGET_READINESS_PACKAGE_VERSION,
    readinessGateVersion: STORAGE_SCHEMA_TARGET_READINESS_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noSupabaseProjectCreated: true,
      noCostAccepted: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      projectsReportPath: options.projectsReportPath ? path.basename(path.resolve(options.projectsReportPath)) : "",
      expectedTargetName: String(options.expectedTargetName ?? "").trim()
    },
    sourceReadiness: readinessReport,
    readiness: {
      readyForSchemaApplyGate: ready,
      reason: readinessReport.readiness.reason
    },
    handoff: {
      requiredExternalInputs: requiredExternalInputs(readinessReport),
      blockedActions: blockedActions(readinessReport),
      nextCommands: commandSet(String(options.expectedTargetName ?? "").trim())
    },
    summary: {
      status: ready ? "ready_for_schema_apply_handoff" : "blocked_target_readiness",
      sourceStatus: readinessReport.summary.status,
      requiredExternalInputCount: requiredExternalInputs(readinessReport).length,
      blockedActionCount: blockedActions(readinessReport).length
    }
  };
}

export async function writeStorageSchemaTargetReadinessPackage(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const readinessOutput = await writeStorageSchemaTargetReadiness(report.sourceReadiness, resolvedOutputDir);
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-target-readiness-package.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-target-readiness-package.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath, readinessJsonPath: readinessOutput.jsonPath, readinessMarkdownPath: readinessOutput.markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    projectsReportPath: "",
    expectedTargetName: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--projects-report") parsed.projectsReportPath = argv[++index] ?? "";
    else if (arg === "--expected-target-name") parsed.expectedTargetName = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaTargetReadinessPackage(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetReadinessPackage(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
