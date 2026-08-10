#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";
import { readProjectJson } from "./qc-project-file-utils.mjs";

export const STORAGE_SCHEMA_ADVISOR_EVIDENCE_VERSION = "storage-schema-advisor-evidence/v1";

const root = process.cwd();
const CREDENTIAL_MARKER = /\b(service[_-]?role|AKIA[0-9A-Z]{16}|BEGIN PRIVATE KEY|X-Amz-[A-Za-z-]+)\b/gi;
const CONNECTION_URL = /\b(?:postgres(?:ql)?|supabase):\/\/[^\s"'<>]+/gi;
const KEY_VALUE_SECRET = /\b(?:api[_-]?key|anon[_-]?key|password|passwd|secret|token)\s*[:=]\s*[^\s,;]+/gi;

function isInsideDirectory(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toProjectRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function redact(value) {
  return String(value ?? "")
    .replace(CONNECTION_URL, "[redacted-database-url]")
    .replace(KEY_VALUE_SECRET, "[redacted-credential]")
    .replace(CREDENTIAL_MARKER, "[redacted-credential]");
}

async function readInputJson(filePath) {
  if (!filePath) return { missing: true, path: "", value: null };
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
      error: error instanceof Error ? error.message : String(error),
      value: null
    };
  }
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const candidates = [
    value.findings,
    value.issues,
    value.advisors,
    value.advisories,
    value.notices,
    value.data,
    value.result,
    value.records
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  if (value.node && typeof value.node === "object") return firstArray(value.node);
  if (value.edges && Array.isArray(value.edges)) return value.edges.map((edge) => edge?.node ?? edge).filter(Boolean);
  return [];
}

function normalizeFinding(item, index) {
  if (typeof item === "string") {
    return {
      id: `finding-${index + 1}`,
      title: redact(item),
      severity: "unknown",
      category: "advisor",
      detail: ""
    };
  }

  const source = item && typeof item === "object" ? item : {};
  const rawTitle = source.title ?? source.name ?? source.message ?? source.cache_key ?? source.description ?? `advisor finding ${index + 1}`;
  const rawSeverity = source.severity ?? source.level ?? source.status ?? source.type ?? "unknown";
  const rawCategory = source.category ?? source.service ?? source.group ?? "advisor";
  const rawDetail = source.detail ?? source.description ?? source.message ?? source.remediation ?? source.hint ?? "";

  return {
    id: redact(source.id ?? source.cache_key ?? `finding-${index + 1}`),
    title: redact(rawTitle),
    severity: redact(rawSeverity),
    category: redact(rawCategory),
    detail: redact(rawDetail)
  };
}

function normalizeAdvisor(kind, source, targetSafety) {
  if (source.missing) {
    return {
      kind,
      status: "missing",
      sourceFile: source.path ? path.basename(source.path) : "",
      findings: [
        {
          id: `${kind}-advisor-export-missing`,
          title: `${kind} advisor export is missing`,
          severity: "blocker",
          category: "evidence",
          detail: redact(source.error ?? "export a Supabase advisor JSON report before promotion")
        }
      ]
    };
  }

  const findings = firstArray(source.value).map(normalizeFinding);
  if (!targetSafety.safe) {
    findings.unshift({
      id: "unsafe-target-name",
      title: "advisor evidence target is not explicitly non-production",
      severity: "blocker",
      category: "target-safety",
      detail: targetSafety.reason
    });
  }

  return {
    kind,
    status: findings.length === 0 ? "passed" : "failed",
    sourceFile: path.basename(source.path),
    findings
  };
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Supabase Advisor Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence version: ${report.evidenceVersion}`,
    `Target name: ${report.inputs.targetName}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Security advisor status: ${report.security.status}`,
    `- Performance advisor status: ${report.performance.status}`,
    `- Total findings: ${report.summary.findingCount}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No database connection: ${report.assumptions.noDatabaseConnection}`,
    `- No provider IO: ${report.assumptions.noProviderIo}`,
    `- No official migration files written: ${report.assumptions.noOfficialMigrationFilesWritten}`,
    `- No database URL printed: ${report.assumptions.noDatabaseUrlPrinted}`,
    "",
    "## Target Safety",
    "",
    `- Safe target: ${report.target.safe}`,
    `- Reason: ${report.target.reason}`,
    ""
  ];

  for (const advisor of [report.security, report.performance]) {
    lines.push(`## ${advisor.kind[0].toUpperCase()}${advisor.kind.slice(1)} Advisor`, "");
    lines.push(`- Status: ${advisor.status}`);
    lines.push(`- Source file: ${advisor.sourceFile}`);
    if (advisor.findings.length > 0) {
      lines.push("- Findings:");
      for (const finding of advisor.findings) {
        lines.push(`  - ${finding.severity}: ${finding.title}`);
      }
    } else {
      lines.push("- Findings: none");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function summaryStatus(security, performance) {
  if (security.status === "missing" || performance.status === "missing") return "blocked_missing_advisor_exports";
  if (security.status !== "passed" || performance.status !== "passed") return "blocked_failed_advisor_exports";
  return "passed";
}

export async function buildStorageSchemaAdvisorEvidence(options = {}) {
  const targetName = String(options.targetName ?? "").trim();
  const target = evaluateStorageSchemaTargetSafety({ targetName });
  const securitySource = await readInputJson(options.securityReportPath ?? "");
  const performanceSource = await readInputJson(options.performanceReportPath ?? "");
  const security = normalizeAdvisor("security", securitySource, target);
  const performance = normalizeAdvisor("performance", performanceSource, target);
  const findingCount = security.findings.length + performance.findings.length;

  return {
    reportType: "supabase-advisor-evidence",
    evidenceVersion: STORAGE_SCHEMA_ADVISOR_EVIDENCE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true,
      sourceReportsAreExportedFromSupabaseAdvisors: true
    },
    inputs: {
      targetName,
      securityReportPath: securitySource.path ? path.basename(securitySource.path) : "",
      performanceReportPath: performanceSource.path ? path.basename(performanceSource.path) : ""
    },
    target,
    security,
    performance,
    summary: {
      status: summaryStatus(security, performance),
      findingCount,
      readyForPromotionGate: security.status === "passed" && performance.status === "passed"
    }
  };
}

export async function writeStorageSchemaAdvisorEvidence(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "supabase-advisor-evidence.json");
  const markdownPath = path.join(resolvedOutputDir, "supabase-advisor-evidence.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    securityReportPath: "",
    performanceReportPath: "",
    targetName: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--security-report") parsed.securityReportPath = argv[++index] ?? "";
    else if (arg === "--performance-report") parsed.performanceReportPath = argv[++index] ?? "";
    else if (arg === "--target-name") parsed.targetName = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaAdvisorEvidence(args);
  if (args.outputDir) {
    await writeStorageSchemaAdvisorEvidence(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
