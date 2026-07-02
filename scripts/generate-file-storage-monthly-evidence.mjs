#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageCostReport } from "./generate-file-storage-cost-report.mjs";
import { buildStorageEgressReport } from "./generate-file-storage-egress-report.mjs";
import { getReportRoot, resolveUserPath } from "./pdm-paths.mjs";

function parseArgs(argv) {
  const parsed = {
    output: "",
    period: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.output = argv[++index] ?? "";
    else if (arg === "--period") parsed.period = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function defaultPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function safePeriod(value) {
  const normalized = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  if (!normalized) return defaultPeriod();
  throw new Error("--period must use YYYY-MM");
}

function reportId(period, date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
  return `${period}-storage-evidence-${stamp}`;
}

function bytesToGb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024 / 1024).toFixed(6));
}

function tableFromMap(map) {
  const rows = Object.entries(map ?? {}).sort((left, right) => (right[1].bytes ?? 0) - (left[1].bytes ?? 0));
  if (!rows.length) return ["| Key | Count | Bytes | GB |", "| --- | ---: | ---: | ---: |", "| none | 0 | 0 | 0 |"];
  return [
    "| Key | Count | Bytes | GB |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([key, value]) => `| ${escapeCell(key)} | ${value.count ?? 0} | ${value.bytes ?? 0} | ${value.gb ?? 0} |`)
  ];
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function buildSummary(costReport, egressReport) {
  return {
    metadataObjectCount: costReport.metadata.count,
    metadataStorageBytes: costReport.metadata.bytes,
    metadataStorageGb: costReport.metadata.gb,
    scannedLocalRootsBytes: costReport.repositoryScan.bytes + costReport.releasePackageScan.bytes,
    scannedLocalRootsGb: bytesToGb(costReport.repositoryScan.bytes + costReport.releasePackageScan.bytes),
    duplicateRecoverableBytes: costReport.metadata.duplicateRecoverableBytes,
    missingLocalObjectCount: costReport.localObjectAudit.missingLocalObjectCount,
    hashMismatchCount: costReport.localObjectAudit.hashMismatchCount,
    orphanLocalFileCount: costReport.localObjectAudit.orphanLocalFileCount,
    auditedEgressRows: egressReport.auditRows.normalized,
    auditedEgressBytes: egressReport.egress.total.bytes,
    auditedEgressGb: egressReport.egress.total.gb,
    publicShareEgressBytes: egressReport.egress.byAccessKind.public_share_package?.bytes ?? 0,
    excludedQcRuntimeRows: egressReport.auditRows.excludedQcRuntime ?? 0,
    legacyUnclassifiedRows: egressReport.auditRows.legacyUnclassified ?? 0
  };
}

function buildReadiness(summary) {
  const blockers = [];
  const warnings = [];

  if (summary.hashMismatchCount > 0) blockers.push("Hash mismatches must be resolved before provider migration.");
  if (summary.missingLocalObjectCount > 0) blockers.push("Missing local objects must be resolved before provider migration.");
  if (summary.orphanLocalFileCount > 0) warnings.push("Orphan local files should be reviewed before lifecycle cleanup.");
  if (summary.auditedEgressRows === 0) warnings.push("No StorageAccessed rows exist yet; egress controls are not proven with real usage.");
  if (summary.publicShareEgressBytes > 0) warnings.push("Public share package egress exists; review share expiry and supplier package size.");
  if (summary.excludedQcRuntimeRows > 0) warnings.push("QC runtime StorageAccessed rows were excluded from governance totals.");
  if (summary.legacyUnclassifiedRows > 0) warnings.push("Legacy StorageAccessed rows without provenance must be reviewed before formal monthly cost decisions.");

  return {
    migrationReady: blockers.length === 0,
    blockers,
    warnings
  };
}

function buildRecommendations(costReport, egressReport, readiness) {
  const recommendations = [
    ...costReport.recommendations.map((item) => `[storage] ${item}`),
    ...egressReport.recommendations.map((item) => `[egress] ${item}`)
  ];
  if (!readiness.migrationReady) {
    recommendations.unshift("Do not execute provider migration until blockers are cleared.");
  }
  return Array.from(new Set(recommendations));
}

export async function buildStorageMonthlyEvidence(options = {}) {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const period = safePeriod(options.period ?? env.PDM_STORAGE_EVIDENCE_PERIOD);
  const costReport = await buildStorageCostReport({ ...options, root, env });
  const egressReport = buildStorageEgressReport({ ...options, root, env });
  const summary = buildSummary(costReport, egressReport);
  const readiness = buildReadiness(summary);

  return {
    reportType: "file-storage-monthly-evidence",
    generatedAt: new Date().toISOString(),
    period,
    assumptions: {
      noProviderMigrationExecuted: true,
      noFilesDeleted: true,
      noProviderRequests: true,
      pricingMustBeRecheckedBeforePurchase: true,
      signedUrlsAreNotReported: true,
      rawShareTokensAreNotReported: true
    },
    summary,
    readiness,
    thresholdUsage: {
      storage: costReport.thresholdUsage,
      egress: egressReport.thresholdUsage
    },
    costReport,
    egressReport,
    recommendations: buildRecommendations(costReport, egressReport, readiness)
  };
}

export function buildStorageMonthlyEvidenceMarkdown(evidence) {
  const lines = [
    `# AI_PDM Storage Monthly Evidence - ${evidence.period}`,
    "",
    `Generated at: \`${evidence.generatedAt}\``,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Metadata objects | ${evidence.summary.metadataObjectCount} |`,
    `| Metadata storage bytes | ${evidence.summary.metadataStorageBytes} |`,
    `| Metadata storage GB | ${evidence.summary.metadataStorageGb} |`,
    `| Scanned local roots bytes | ${evidence.summary.scannedLocalRootsBytes} |`,
    `| Scanned local roots GB | ${evidence.summary.scannedLocalRootsGb} |`,
    `| Duplicate recoverable bytes | ${evidence.summary.duplicateRecoverableBytes} |`,
    `| Missing local objects | ${evidence.summary.missingLocalObjectCount} |`,
    `| Hash mismatches | ${evidence.summary.hashMismatchCount} |`,
    `| Orphan local files | ${evidence.summary.orphanLocalFileCount} |`,
    `| Audited egress rows | ${evidence.summary.auditedEgressRows} |`,
    `| Audited egress bytes | ${evidence.summary.auditedEgressBytes} |`,
    `| Audited egress GB | ${evidence.summary.auditedEgressGb} |`,
    `| Public share egress bytes | ${evidence.summary.publicShareEgressBytes} |`,
    `| Excluded QC runtime rows | ${evidence.summary.excludedQcRuntimeRows} |`,
    `| Legacy unclassified egress rows | ${evidence.summary.legacyUnclassifiedRows} |`,
    "",
    "## Readiness",
    "",
    `Migration ready: \`${evidence.readiness.migrationReady ? "yes" : "no"}\``,
    "",
    "### Blockers",
    "",
    ...(evidence.readiness.blockers.length ? evidence.readiness.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "### Warnings",
    "",
    ...(evidence.readiness.warnings.length ? evidence.readiness.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Storage By Provider",
    "",
    ...tableFromMap(evidence.costReport.metadata.byProvider),
    "",
    "## Egress By Route",
    "",
    ...tableFromMap(evidence.egressReport.egress.byRoute),
    "",
    "## Egress By Access Kind",
    "",
    ...tableFromMap(evidence.egressReport.egress.byAccessKind),
    "",
    "## Recommendations",
    "",
    ...evidence.recommendations.map((item) => `- ${item}`),
    "",
    "## Guardrails",
    "",
    "- No provider migration was executed.",
    "- No files were deleted.",
    "- No storage provider request was made.",
    "- Signed URL values, raw share tokens, and token hashes are not reported.",
    ""
  ];
  return lines.join("\n");
}

export async function writeStorageMonthlyEvidence(evidence, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "storage-monthly-evidence.json");
  const mdPath = path.join(outputDir, "storage-monthly-evidence.md");
  await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await writeFile(mdPath, buildStorageMonthlyEvidenceMarkdown(evidence), "utf8");
  return { jsonPath, mdPath };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const period = safePeriod(args.period || process.env.PDM_STORAGE_EVIDENCE_PERIOD);
  const id = reportId(period);
  const outputDir = args.output
    ? resolveUserPath(root, args.output)
    : path.join(getReportRoot(root, "storage-monthly-evidence"), id);
  const evidence = await buildStorageMonthlyEvidence({ root, period });
  const files = await writeStorageMonthlyEvidence(evidence, outputDir);
  const result = {
    reportId: id,
    outputDir,
    files: Object.values(files).map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"))
  };
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
