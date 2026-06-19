#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getStorageEvidenceDashboard } from "../src/lib/storage-evidence-dashboard.ts";

export const STORAGE_GOVERNANCE_GATE_VERSION = "file-storage-governance-gate/v1";

function decision(allowed, reason) {
  return {
    allowed: Boolean(allowed),
    reason
  };
}

function statusFor(dashboard) {
  if (!dashboard.source.available || !dashboard.governance) return "blocked_missing_evidence";
  if (dashboard.governance.level === "blocked") return "blocked_storage_integrity";
  if (dashboard.governance.level === "observe") return "observation_required";
  if (dashboard.governance.level === "review") return "cost_review_required";
  if (dashboard.governance.level === "control") return "cost_controls_required";
  return "stable";
}

function decisionsFor(dashboard) {
  const governance = dashboard.governance;
  const migrationReady = dashboard.readiness?.migrationReady === true;
  if (!dashboard.source.available || !governance) {
    return {
      providerMigration: decision(false, "monthly storage evidence is missing or invalid"),
      lifecycleCleanup: decision(false, "monthly storage evidence is missing or invalid"),
      alternateProviderReview: decision(false, "monthly storage evidence is missing or invalid")
    };
  }

  return {
    providerMigration: decision(
      governance.providerMigrationAllowed && migrationReady,
      governance.providerMigrationAllowed && migrationReady
        ? "governance permits provider migration review"
        : "provider migration is blocked until governance and readiness allow it"
    ),
    lifecycleCleanup: decision(
      governance.lifecycleCleanupAllowed && migrationReady,
      governance.lifecycleCleanupAllowed && migrationReady
        ? "governance permits controlled lifecycle cleanup review"
        : "lifecycle cleanup is blocked until storage evidence is clean enough"
    ),
    alternateProviderReview: decision(
      governance.alternateProviderReviewRecommended,
      governance.alternateProviderReviewRecommended
        ? "alternate provider cost review is recommended"
        : "alternate provider review is not required by current evidence"
    )
  };
}

function evidenceQualityFor(dashboard) {
  const summary = dashboard.summary ?? {};
  const excludedQcRuntimeRows = Number(summary.excludedQcRuntimeRows ?? 0);
  const legacyUnclassifiedRows = Number(summary.legacyUnclassifiedRows ?? 0);
  return {
    excludedQcRuntimeRows,
    legacyUnclassifiedRows,
    provenanceReviewRequired: legacyUnclassifiedRows > 0,
    qcRuntimeRowsExcluded: excludedQcRuntimeRows > 0,
    warnings: Array.isArray(dashboard.readiness?.warnings)
      ? dashboard.readiness.warnings.filter((warning) => /QC runtime|Legacy StorageAccessed|provenance/i.test(String(warning))).slice(0, 10)
      : []
  };
}

function nextActions(report) {
  if (report.summary.status === "blocked_missing_evidence") {
    return ["Run npm.cmd run storage:monthly-evidence:scheduled before making storage provider decisions."];
  }
  if (report.summary.status === "blocked_storage_integrity") {
    return ["Resolve missing local objects, hash mismatches, and other storage evidence blockers before migration or cleanup."];
  }
  if (report.summary.status === "observation_required") {
    return ["Keep storage evidence in observation mode until real download/share activity is captured."];
  }
  if (report.summary.status === "cost_review_required") {
    return ["Review lifecycle policy, deduplication candidates, public share expiry, and alternate provider options."];
  }
  if (report.summary.status === "cost_controls_required") {
    return ["Open provider cost review and lifecycle cleanup approval before the next billing cycle."];
  }
  return ["Continue monthly storage governance review; no provider change is required by current evidence."];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM File Storage Governance Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Gate version: ${report.gateVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Governance level: ${report.summary.governanceLevel || "-"}`,
    `- Governance label: ${report.summary.governanceLabel || "-"}`,
    `- Source available: ${report.source.available}`,
    `- Provider migration allowed: ${report.decisions.providerMigration.allowed}`,
    `- Lifecycle cleanup allowed: ${report.decisions.lifecycleCleanup.allowed}`,
    `- Alternate provider review required: ${report.decisions.alternateProviderReview.allowed}`,
    `- Provenance review required: ${report.evidenceQuality.provenanceReviewRequired}`,
    "",
    "## Evidence Quality",
    "",
    `- Excluded QC runtime rows: ${report.evidenceQuality.excludedQcRuntimeRows}`,
    `- Legacy unclassified rows: ${report.evidenceQuality.legacyUnclassifiedRows}`,
    `- QC runtime rows excluded: ${report.evidenceQuality.qcRuntimeRowsExcluded}`,
    "",
    "## Reasons",
    "",
    `- Provider migration: ${report.decisions.providerMigration.reason}`,
    `- Lifecycle cleanup: ${report.decisions.lifecycleCleanup.reason}`,
    `- Alternate provider review: ${report.decisions.alternateProviderReview.reason}`,
    "",
    "## Guardrails",
    "",
    `- Evidence only: ${report.assumptions.evidenceOnly}`,
    `- No provider requests: ${report.assumptions.noProviderRequests}`,
    `- No files deleted: ${report.assumptions.noFilesDeleted}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    "",
    "## Next Actions",
    ""
  ];

  for (const action of report.handoff.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageGovernanceGate(options = {}) {
  const root = options.root ?? process.cwd();
  const dashboard = await getStorageEvidenceDashboard({
    root,
    env: options.env ?? process.env,
    latestManifestPath: options.latestManifestPath
  });
  const status = statusFor(dashboard);
  const report = {
    reportType: "file-storage-governance-gate",
    gateVersion: STORAGE_GOVERNANCE_GATE_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions: {
      evidenceOnly: true,
      noProviderRequests: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true,
      noDatabaseConnection: true,
      noSqlApplied: true,
      noSupabaseConnectorCalls: true,
      rawSignedUrlsNotReported: true
    },
    inputs: {
      latestManifestPath: dashboard.source.latestManifestPath
    },
    source: {
      available: dashboard.source.available,
      error: dashboard.source.error,
      runId: dashboard.run?.runId ?? "",
      period: dashboard.run?.period ?? "",
      evidenceJsonPath: dashboard.source.evidenceJsonPath,
      evidenceMarkdownPath: dashboard.source.evidenceMarkdownPath
    },
    summary: {
      status,
      governanceLevel: dashboard.governance?.level ?? "",
      governanceLabel: dashboard.governance?.label ?? "",
      storageUsageRatio: dashboard.governance?.storageUsageRatio ?? null,
      egressUsageRatio: dashboard.governance?.egressUsageRatio ?? null,
      blockerCount: dashboard.readiness?.blockers.length ?? 0,
      warningCount: dashboard.readiness?.warnings.length ?? 0
    },
    decisions: decisionsFor(dashboard),
    evidenceQuality: evidenceQualityFor(dashboard),
    governance: dashboard.governance,
    readiness: dashboard.readiness,
    handoff: {
      nextActions: []
    }
  };
  report.handoff.nextActions = nextActions(report);
  return report;
}

export async function writeStorageGovernanceGate(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "file-storage-governance-gate.json");
  const markdownPath = path.join(resolvedOutputDir, "file-storage-governance-gate.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    latestManifestPath: "",
    outputDir: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--latest-manifest") parsed.latestManifestPath = argv[++index] ?? "";
    else if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageGovernanceGate({
    latestManifestPath: args.latestManifestPath || undefined
  });
  if (args.outputDir) await writeStorageGovernanceGate(report, args.outputDir);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
