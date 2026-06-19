#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildStorageMonthlyEvidence,
  writeStorageMonthlyEvidence
} from "./generate-file-storage-monthly-evidence.mjs";
import { getReportRoot, resolveUserPath } from "./pdm-paths.mjs";

function parseArgs(argv) {
  const parsed = {
    output: "",
    latestOutput: "",
    period: "",
    failOnBlocker: false,
    failOnWarning: false,
    noLatest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.output = argv[++index] ?? "";
    else if (arg === "--latest-output") parsed.latestOutput = argv[++index] ?? "";
    else if (arg === "--period") parsed.period = argv[++index] ?? "";
    else if (arg === "--fail-on-blocker") parsed.failOnBlocker = true;
    else if (arg === "--fail-on-warning") parsed.failOnWarning = true;
    else if (arg === "--no-latest") parsed.noLatest = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function timestamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

function scheduleRunId(period, date = new Date()) {
  return `${period}-storage-evidence-scheduled-${timestamp(date)}`;
}

function classifyEvidence(evidence) {
  if (!evidence.readiness.migrationReady) return "blocked";
  if (evidence.readiness.warnings.length > 0) return "warning";
  return "ok";
}

function suggestedExitCode(status, options) {
  if (status === "blocked" && options.failOnBlocker) return 2;
  if ((status === "blocked" || status === "warning") && options.failOnWarning) return 3;
  return 0;
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function evidenceQuality(summary, readiness) {
  const excludedQcRuntimeRows = Number(summary.excludedQcRuntimeRows ?? 0);
  const legacyUnclassifiedRows = Number(summary.legacyUnclassifiedRows ?? 0);
  return {
    excludedQcRuntimeRows,
    legacyUnclassifiedRows,
    provenanceReviewRequired: legacyUnclassifiedRows > 0,
    qcRuntimeRowsExcluded: excludedQcRuntimeRows > 0,
    warnings: Array.isArray(readiness.warnings)
      ? readiness.warnings.filter((warning) => /QC runtime|Legacy StorageAccessed|provenance/i.test(String(warning))).slice(0, 10)
      : []
  };
}

export async function runStorageMonthlyEvidenceSchedule(options = {}) {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const evidence = await buildStorageMonthlyEvidence({
    ...options,
    root,
    env,
    period: options.period || env.PDM_STORAGE_EVIDENCE_PERIOD
  });
  const outputRoot = getReportRoot(root, "storage-monthly-evidence", env);
  const runId = scheduleRunId(evidence.period, options.now ?? new Date());
  const outputDir = options.output ? resolveUserPath(root, options.output) : path.join(outputRoot, runId);
  const evidenceFiles = await writeStorageMonthlyEvidence(evidence, outputDir);
  const status = classifyEvidence(evidence);
  const exitCode = suggestedExitCode(status, options);
  const manifestPath = path.join(outputDir, "storage-monthly-evidence-run.json");
  const latestPath = options.noLatest
    ? null
    : options.latestOutput
      ? resolveUserPath(root, options.latestOutput)
      : path.join(outputRoot, "latest-storage-monthly-evidence-run.json");

  const manifest = {
    reportType: "file-storage-monthly-evidence-scheduled-run",
    taskId: "DEV-STORAGE-COST-001",
    runId,
    generatedAt: new Date().toISOString(),
    period: evidence.period,
    status,
    suggestedExitCode: exitCode,
    exitPolicy: {
      failOnBlocker: Boolean(options.failOnBlocker),
      failOnWarning: Boolean(options.failOnWarning)
    },
    outputDir,
    files: {
      evidenceJson: relativePath(root, evidenceFiles.jsonPath),
      evidenceMarkdown: relativePath(root, evidenceFiles.mdPath),
      runManifest: relativePath(root, manifestPath),
      latestManifest: latestPath ? relativePath(root, latestPath) : null
    },
    summary: evidence.summary,
    readiness: evidence.readiness,
    evidenceQuality: evidenceQuality(evidence.summary, evidence.readiness),
    thresholdUsage: evidence.thresholdUsage,
    recommendationCount: evidence.recommendations.length,
    commands: {
      scheduled: "npm.cmd run storage:monthly-evidence:scheduled",
      manualEvidence: "npm.cmd run storage:monthly-evidence",
      qc: "npm.cmd run qc:file-storage-monthly-evidence-schedule"
    },
    guardrails: {
      noProviderMigrationExecuted: true,
      noFilesDeleted: true,
      noProviderRequests: true,
      noSignedUrlValuesReported: true,
      noRawShareTokensReported: true
    }
  };

  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (latestPath) {
    await fsp.mkdir(path.dirname(latestPath), { recursive: true });
    await fsp.writeFile(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  return {
    manifest,
    manifestPath,
    latestPath,
    evidenceFiles,
    exitCode
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const result = await runStorageMonthlyEvidenceSchedule({
    root,
    output: args.output,
    latestOutput: args.latestOutput,
    period: args.period,
    failOnBlocker: args.failOnBlocker,
    failOnWarning: args.failOnWarning,
    noLatest: args.noLatest
  });

  console.log(
    JSON.stringify(
      {
        runId: result.manifest.runId,
        status: result.manifest.status,
        suggestedExitCode: result.exitCode,
        outputDir: result.manifest.outputDir,
        files: result.manifest.files
      },
      null,
      2
    )
  );
  process.exitCode = result.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
