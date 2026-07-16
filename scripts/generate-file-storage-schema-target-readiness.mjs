#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  STORAGE_SCHEMA_FORBIDDEN_TARGETS,
  evaluateStorageSchemaTargetSafety
} from "./file-storage-schema-target-safety.mjs";

export const STORAGE_SCHEMA_TARGET_READINESS_VERSION = "storage-schema-target-readiness/v1";

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

function projectHost(project) {
  return project?.database?.host ?? project?.db_host ?? project?.host ?? "";
}

function normalizeProject(project, expectedTargetName) {
  const name = String(project?.name ?? project?.project_name ?? "");
  const ref = String(project?.ref ?? project?.id ?? project?.project_ref ?? "");
  const host = projectHost(project);
  const safety = evaluateStorageSchemaTargetSafety({
    targetName: name,
    databaseUrl: host
  });
  const normalizedName = normalizeName(name);
  const expectedConfigured = Boolean(expectedTargetName);
  const expectedMatches = !expectedConfigured || normalizedName === normalizeName(expectedTargetName);
  const aiPdmNamed = normalizedName.includes("ai_pdm");

  return {
    name,
    ref,
    region: project?.region ?? "",
    status: project?.status ?? "",
    safetyStatus: safety.status,
    safetyReason: safety.reason,
    aiPdmNamed,
    expectedMatches,
    readyForStorageSchemaGate: safety.safe && aiPdmNamed && expectedMatches
  };
}

async function readInventory(filePath) {
  if (!filePath) return { missing: true, path: "", projects: [] };
  const resolvedPath = path.resolve(filePath);
  try {
    const parsed = JSON.parse(await fsp.readFile(resolvedPath, "utf8"));
    return {
      missing: false,
      path: resolvedPath,
      projects: normalizeProjectInventory(parsed)
    };
  } catch (error) {
    return {
      missing: true,
      path: resolvedPath,
      projects: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function readinessStatus({ inventory, targetSafety, projectCandidates }) {
  if (inventory.missing) return "blocked_missing_project_inventory";
  if (targetSafety && !targetSafety.safe) return "blocked_unsafe_expected_target";
  if (projectCandidates.some((project) => project.readyForStorageSchemaGate)) return "ready_for_storage_schema_apply_gate";
  return "blocked_no_approved_target";
}

function readinessReason(status) {
  if (status === "blocked_missing_project_inventory") return "export Supabase project inventory before choosing a schema target";
  if (status === "blocked_unsafe_expected_target") return "expected target is production-like or matches a known forbidden project";
  if (status === "blocked_no_approved_target") return "inventory contains no approved AI_PDM disposable/staging/shadow/test target";
  return "inventory contains an approved AI_PDM non-production target for schema gates";
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Target Readiness",
    "",
    `Generated at: ${report.generatedAt}`,
    `Gate version: ${report.gateVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Reason: ${report.readiness.reason}`,
    `- Expected target name: ${report.inputs.expectedTargetName || "-"}`,
    `- Project count: ${report.summary.projectCount}`,
    `- Ready candidate count: ${report.summary.readyCandidateCount}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No Supabase project created: ${report.assumptions.noSupabaseProjectCreated}`,
    `- No cost accepted: ${report.assumptions.noCostAccepted}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No SQL applied: ${report.assumptions.noSqlApplied}`,
    "",
    "## Forbidden Targets",
    ""
  ];

  for (const target of report.forbiddenTargets) {
    lines.push(`- ${target.name} (${target.ref})`);
  }

  lines.push("", "## Projects", "");
  if (report.projects.length === 0) {
    lines.push("- No project inventory available.");
  } else {
    for (const project of report.projects) {
      lines.push(`- ${project.name || "(unnamed)"}: ${project.safetyStatus}, ai_pdm=${project.aiPdmNamed}, expected=${project.expectedMatches}, ready=${project.readyForStorageSchemaGate}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageSchemaTargetReadiness(options = {}) {
  const inventory = options.projectInventory
    ? { missing: false, path: "", projects: normalizeProjectInventory(options.projectInventory) }
    : await readInventory(options.projectsReportPath ?? "");
  const expectedTargetName = String(options.expectedTargetName ?? "").trim();
  const targetSafety = expectedTargetName
    ? evaluateStorageSchemaTargetSafety({ targetName: expectedTargetName })
    : null;
  const projects = inventory.projects.map((project) => normalizeProject(project, expectedTargetName));
  const status = readinessStatus({ inventory, targetSafety, projectCandidates: projects });
  const readyCandidates = projects.filter((project) => project.readyForStorageSchemaGate);

  return {
    reportType: "file-storage-schema-target-readiness",
    gateVersion: STORAGE_SCHEMA_TARGET_READINESS_VERSION,
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
      projectsReportPath: inventory.path ? path.basename(inventory.path) : "",
      expectedTargetName
    },
    forbiddenTargets: STORAGE_SCHEMA_FORBIDDEN_TARGETS,
    expectedTargetSafety: targetSafety,
    projects,
    readiness: {
      readyForStorageSchemaApplyGate: status === "ready_for_storage_schema_apply_gate",
      reason: readinessReason(status)
    },
    summary: {
      status,
      projectCount: projects.length,
      readyCandidateCount: readyCandidates.length,
      forbiddenProjectCount: projects.filter((project) => project.safetyStatus === "unsafe_known_target").length
    }
  };
}

export async function writeStorageSchemaTargetReadiness(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-target-readiness.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-target-readiness.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
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
  const report = await buildStorageSchemaTargetReadiness(args);
  if (args.outputDir) {
    await writeStorageSchemaTargetReadiness(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
