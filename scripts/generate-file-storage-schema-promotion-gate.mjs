#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION } from "./generate-file-storage-schema-migration-package.mjs";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_PROMOTION_GATE_VERSION = "storage-schema-promotion-gate/v1";

const root = process.cwd();

function isInsideDirectory(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toProjectRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Promotion Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Gate version: ${report.gateVersion}`,
    `Migration package version: ${report.migrationPackageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Ready for formal migration review: ${report.readiness.readyForFormalMigrationReview}`,
    `- Passed checks: ${report.summary.passedCheckCount}`,
    `- Blocker count: ${report.summary.blockerCount}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No SQL applied: ${report.assumptions.noSqlApplied}`,
    `- No official migration files written: ${report.assumptions.noOfficialMigrationFilesWritten}`,
    `- Advisors required: ${report.assumptions.supabaseAdvisorsRequired}`,
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

  lines.push("");
  return `${lines.join("\n")}\n`;
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

function evaluateApplyEvidence(evidence) {
  const checks = [];
  if (evidence.missing) {
    return {
      summary: { status: "missing", targetName: "" },
      checks: [buildCheck("apply evidence is present", false, evidence.error || "missing apply report")],
      blockers: ["missing storage schema apply gate report"]
    };
  }

  const report = evidence.value;
  const targetName = report?.inputs?.targetName ?? "";
  checks.push(buildCheck("apply evidence is present", true));
  checks.push(buildCheck("apply report type is valid", report?.reportType === "file-storage-schema-apply-gate"));
  checks.push(buildCheck("apply status is disposable success", report?.summary?.status === "applied_to_disposable", report?.summary?.status ?? ""));
  checks.push(buildCheck("apply target is non-production", /disposable|staging|shadow|test/i.test(targetName) && !/prod|production|main/i.test(targetName), targetName));
  checks.push(buildCheck("apply gate avoided provider IO", report?.assumptions?.noProviderIo === true));
  checks.push(buildCheck("apply gate avoided official migration writes", report?.assumptions?.noOfficialMigrationFilesWritten === true));
  checks.push(buildCheck("apply gate found no disallowed grants", Number(report?.summary?.disallowedGrantCount ?? 1) === 0));

  return {
    summary: { status: report?.summary?.status ?? "unknown", targetName },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `apply evidence failed: ${check.name}`)
  };
}

function evaluateVerifyEvidence(evidence) {
  const checks = [];
  if (evidence.missing) {
    return {
      summary: { status: "missing", targetName: "" },
      checks: [buildCheck("verify evidence is present", false, evidence.error || "missing verify report")],
      blockers: ["missing storage schema verify gate report"]
    };
  }

  const report = evidence.value;
  const targetName = report?.inputs?.targetName ?? "";
  checks.push(buildCheck("verify evidence is present", true));
  checks.push(buildCheck("verify report type is valid", report?.reportType === "file-storage-schema-verify-gate"));
  checks.push(buildCheck("verify status is clean", report?.summary?.status === "verified", report?.summary?.status ?? ""));
  checks.push(buildCheck("verify readiness is true", report?.readiness?.readyToPromoteSchema === true));
  checks.push(buildCheck("verify findings are empty", Array.isArray(report?.findings) && report.findings.length === 0));
  checks.push(buildCheck("verify gate was read-only", report?.assumptions?.readOnlyVerification === true && report?.assumptions?.noSqlApplied === true));
  checks.push(buildCheck("verify gate found no disallowed grants", Number(report?.summary?.disallowedGrantCount ?? 1) === 0));
  checks.push(buildCheck("verify required providers are seeded", Number(report?.summary?.providersVerifiedCount ?? 0) >= 4));

  return {
    summary: { status: report?.summary?.status ?? "unknown", targetName },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `verify evidence failed: ${check.name}`)
  };
}

function advisorStatus(advisors, type) {
  if (advisors?.[type]?.status) return advisors[type];
  if (Array.isArray(advisors?.advisors)) return advisors.advisors.find((item) => item.type === type) ?? {};
  return {};
}

function evaluateAdvisorEvidence(evidence) {
  const checks = [];
  if (evidence.missing) {
    return {
      summary: { securityStatus: "missing", performanceStatus: "missing" },
      checks: [buildCheck("Supabase advisor evidence is present", false, evidence.error || "missing advisor evidence")],
      blockers: ["missing Supabase advisor evidence"]
    };
  }

  const report = evidence.value;
  const security = advisorStatus(report, "security");
  const performance = advisorStatus(report, "performance");
  const securityFindings = security.findings ?? security.issues ?? [];
  const performanceFindings = performance.findings ?? performance.issues ?? [];
  checks.push(buildCheck("Supabase advisor evidence is present", true));
  checks.push(buildCheck("security advisor passed", security.status === "passed", security.status ?? ""));
  checks.push(buildCheck("performance advisor passed", performance.status === "passed", performance.status ?? ""));
  checks.push(buildCheck("security advisor has no findings", Array.isArray(securityFindings) && securityFindings.length === 0));
  checks.push(buildCheck("performance advisor has no findings", Array.isArray(performanceFindings) && performanceFindings.length === 0));

  return {
    summary: {
      securityStatus: security.status ?? "unknown",
      performanceStatus: performance.status ?? "unknown"
    },
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => `advisor evidence failed: ${check.name}`)
  };
}

function statusFor(blockers) {
  if (blockers.some((blocker) => blocker.startsWith("missing"))) return "blocked_missing_evidence";
  if (blockers.length > 0) return "blocked_failed_evidence";
  return "ready_for_formal_migration_review";
}

export async function buildStorageSchemaPromotionGate(options = {}) {
  const applyEvidence = await readInputJson(options.applyReportPath ?? "");
  const verifyEvidence = await readInputJson(options.verifyReportPath ?? "");
  const advisorEvidence = await readInputJson(options.advisorEvidencePath ?? "");

  const applyResult = evaluateApplyEvidence(applyEvidence);
  const verifyResult = evaluateVerifyEvidence(verifyEvidence);
  const advisorResult = evaluateAdvisorEvidence(advisorEvidence);
  const checks = [...applyResult.checks, ...verifyResult.checks, ...advisorResult.checks];
  const blockers = [...applyResult.blockers, ...verifyResult.blockers, ...advisorResult.blockers];
  const status = statusFor(blockers);

  return {
    reportType: "file-storage-schema-promotion-gate",
    gateVersion: STORAGE_SCHEMA_PROMOTION_GATE_VERSION,
    migrationPackageVersion: STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noOfficialMigrationFilesWritten: true,
      noProviderIo: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true,
      supabaseAdvisorsRequired: true
    },
    inputs: {
      applyReportPath: applyEvidence.path ? path.basename(applyEvidence.path) : "",
      verifyReportPath: verifyEvidence.path ? path.basename(verifyEvidence.path) : "",
      advisorEvidencePath: advisorEvidence.path ? path.basename(advisorEvidence.path) : ""
    },
    sourceEvidence: {
      apply: applyResult.summary,
      verify: verifyResult.summary,
      advisors: advisorResult.summary
    },
    readiness: {
      readyForFormalMigrationReview: status === "ready_for_formal_migration_review",
      reason: status === "ready_for_formal_migration_review"
        ? "apply, verify, and advisor evidence all passed"
        : "required schema promotion evidence is missing or failed"
    },
    summary: {
      status,
      passedCheckCount: checks.filter((check) => check.passed).length,
      blockerCount: blockers.length
    },
    checks,
    blockers
  };
}

export async function writeStorageSchemaPromotionGate(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-promotion-gate.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-promotion-gate.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    applyReportPath: "",
    verifyReportPath: "",
    advisorEvidencePath: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply-report") parsed.applyReportPath = argv[++index] ?? "";
    else if (arg === "--verify-report") parsed.verifyReportPath = argv[++index] ?? "";
    else if (arg === "--advisor-evidence") parsed.advisorEvidencePath = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaPromotionGate(args);
  if (args.outputDir) {
    await writeStorageSchemaPromotionGate(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
