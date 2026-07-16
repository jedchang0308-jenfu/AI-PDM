#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageCostReport, buildStorageMetadataContext } from "./generate-file-storage-cost-report.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DRAFT_RETENTION_DAYS = 90;
const DEFAULT_WARM_AFTER_DAYS = 180;
const DEFAULT_COLD_AFTER_DAYS = 365;
const DEFAULT_MAX_UPLOAD_MB = 500;
const DEFAULT_WARN_STORAGE_PCT = 70;
const DEFAULT_CRITICAL_STORAGE_PCT = 90;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ageDays(createdAt, now) {
  const created = Date.parse(createdAt ?? "");
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((now.getTime() - created) / DAY_MS));
}

function isReleasedProtected(object) {
  return (
    object.source === "release_packages" ||
    object.businessStatus === "Released" ||
    object.businessStatus === "ReleasedPackage" ||
    object.fileRole === "release_package"
  );
}

function isDraftLike(object) {
  return ["Draft", "Pending", "PendingReview", "Rejected", "ChangesRequested"].includes(String(object.businessStatus ?? ""));
}

function classifyObject(object, policy, now) {
  const age = ageDays(object.createdAt, now);
  const bytes = Number(object.bytes || 0);
  const overUploadLimit = bytes > policy.maxUploadBytes;
  const releasedProtected = isReleasedProtected(object);
  const draftLike = isDraftLike(object);
  const actions = [];
  const blockers = [];
  const warnings = [];

  if (releasedProtected) {
    actions.push("retain_released_official");
  } else if (draftLike && age !== null && age >= policy.draftRetentionDays) {
    actions.push("review_stale_draft_retention");
  } else if (age !== null && age >= policy.coldAfterDays) {
    actions.push("review_cold_archive_candidate");
  } else if (age !== null && age >= policy.warmAfterDays) {
    actions.push("review_warm_tier_candidate");
  } else {
    actions.push("retain_hot");
  }

  if (overUploadLimit) {
    warnings.push("object_exceeds_upload_limit");
  }

  if (!object.hash) {
    blockers.push("sha256_missing");
  }

  return {
    id: object.id,
    source: object.source,
    provider: object.provider,
    filename: object.filename,
    storageKey: object.storageKey,
    businessStatus: object.businessStatus,
    lifecycleTier: object.lifecycleTier,
    linkedEntityType: object.linkedEntityType,
    linkedEntityId: object.linkedEntityId,
    bytes,
    ageDays: age,
    sha256: object.hash,
    releasedProtected,
    overUploadLimit,
    actions,
    blockers,
    warnings
  };
}

function buildActionSummary(objects) {
  const summary = {};
  for (const object of objects) {
    for (const action of object.actions) {
      summary[action] ??= { count: 0, bytes: 0 };
      summary[action].count += 1;
      summary[action].bytes += object.bytes;
    }
  }
  return summary;
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Lifecycle Policy Dry-run",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Policy",
    "",
    `- Draft retention days: ${report.policy.draftRetentionDays}`,
    `- Warm after days: ${report.policy.warmAfterDays}`,
    `- Cold after days: ${report.policy.coldAfterDays}`,
    `- Max upload MB: ${report.policy.maxUploadMb}`,
    `- Storage warning percent: ${report.policy.warnStoragePct}`,
    `- Storage critical percent: ${report.policy.criticalStoragePct}`,
    "",
    "## Summary",
    "",
    `- Metadata objects: ${report.summary.totalMetadataObjects}`,
    `- Released protected objects: ${report.summary.releasedProtectedCount}`,
    `- Stale draft review objects: ${report.summary.staleDraftReviewCount}`,
    `- Warm tier candidates: ${report.summary.warmTierCandidateCount}`,
    `- Cold archive candidates: ${report.summary.coldArchiveCandidateCount}`,
    `- Upload limit warnings: ${report.summary.uploadLimitWarningCount}`,
    `- Lifecycle blocker count: ${report.summary.lifecycleBlockerCount}`,
    "",
    "## Guardrails",
    "",
    `- Dry-run only: ${report.assumptions.dryRunOnly}`,
    `- No files deleted: ${report.assumptions.noFilesDeleted}`,
    `- No lifecycle rules applied: ${report.assumptions.noLifecycleRulesApplied}`,
    `- Released files are protected: ${report.assumptions.releasedFilesProtected}`,
    "",
    "## Candidate Actions",
    ""
  ];

  if (report.objects.length === 0) {
    lines.push("- No storage metadata objects were found.");
  } else {
    for (const item of report.objects) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename} -> ${item.actions.join(", ")}${item.warnings.length ? `; warnings=${item.warnings.join(",")}` : ""}`);
    }
  }

  if (report.blockers.length > 0) {
    lines.push("", "## Blockers", "");
    for (const item of report.blockers) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename ?? "-"} (${item.reason})`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageLifecyclePolicyDryRun(options = {}) {
  const env = options.env ?? process.env;
  const now = new Date(options.now ?? Date.now());
  const maxUploadMb = parsePositiveNumber(env.PDM_STORAGE_MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB);
  const policy = {
    draftRetentionDays: parsePositiveInt(env.PDM_STORAGE_DRAFT_RETENTION_DAYS, DEFAULT_DRAFT_RETENTION_DAYS),
    warmAfterDays: parsePositiveInt(env.PDM_STORAGE_WARM_AFTER_DAYS, DEFAULT_WARM_AFTER_DAYS),
    coldAfterDays: parsePositiveInt(env.PDM_STORAGE_COLD_AFTER_DAYS, DEFAULT_COLD_AFTER_DAYS),
    maxUploadMb,
    maxUploadBytes: Math.floor(maxUploadMb * 1024 * 1024),
    warnStoragePct: parsePositiveNumber(env.PDM_STORAGE_WARN_PCT, DEFAULT_WARN_STORAGE_PCT),
    criticalStoragePct: parsePositiveNumber(env.PDM_STORAGE_CRITICAL_PCT, DEFAULT_CRITICAL_STORAGE_PCT)
  };
  const costReport = await buildStorageCostReport(options);
  const metadataContext = buildStorageMetadataContext(options);
  const metadataObjects = options.metadataObjects ?? metadataContext.metadataObjects;
  const classified = metadataObjects.map((object) => classifyObject(object, policy, now));
  const blockerMap = new Map();

  for (const item of costReport.localObjectAudit.missingLocalObjects) {
    blockerMap.set(`${item.source}:${item.id}:missing`, {
      id: item.id,
      source: item.source,
      filename: item.filename,
      reason: item.reason === "outside_local_root" ? "source_path_outside_local_root" : "source_file_missing"
    });
  }
  for (const item of costReport.localObjectAudit.hashMismatchObjects) {
    blockerMap.set(`${item.source}:${item.id}:sha256_mismatch`, {
      id: item.id,
      source: item.source,
      filename: item.filename,
      reason: "sha256_mismatch",
      expectedSha256: item.expectedSha256,
      actualSha256: item.actualSha256
    });
  }
  for (const object of classified) {
    for (const reason of object.blockers) {
      blockerMap.set(`${object.source}:${object.id}:${reason}`, {
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason
      });
    }
  }

  const thresholdPct = costReport.thresholdUsage.metadataStorageIncludedPct ?? 0;
  const storageThresholdStatus =
    thresholdPct >= policy.criticalStoragePct ? "critical" : thresholdPct >= policy.warnStoragePct ? "warning" : "ok";

  return {
    reportType: "file-storage-lifecycle-policy-dry-run",
    generatedAt: new Date().toISOString(),
    assumptions: {
      dryRunOnly: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true,
      noLifecycleRulesApplied: true,
      noProviderRequests: true,
      releasedFilesProtected: true,
      lifecycleCleanupBlockedWhenHashAuditFails: true
    },
    policy,
    inputs: costReport.inputs,
    sourceCostReport: {
      reportType: costReport.reportType,
      generatedAt: costReport.generatedAt,
      thresholdUsage: costReport.thresholdUsage,
      metadataCount: costReport.metadata.count
    },
    summary: {
      totalMetadataObjects: classified.length,
      releasedProtectedCount: classified.filter((item) => item.releasedProtected).length,
      staleDraftReviewCount: classified.filter((item) => item.actions.includes("review_stale_draft_retention")).length,
      warmTierCandidateCount: classified.filter((item) => item.actions.includes("review_warm_tier_candidate")).length,
      coldArchiveCandidateCount: classified.filter((item) => item.actions.includes("review_cold_archive_candidate")).length,
      uploadLimitWarningCount: classified.filter((item) => item.overUploadLimit).length,
      lifecycleBlockerCount: blockerMap.size,
      storageThresholdStatus
    },
    actionSummary: buildActionSummary(classified),
    objects: classified,
    blockers: [...blockerMap.values()],
    recommendations: buildLifecycleRecommendations(classified, [...blockerMap.values()], storageThresholdStatus)
  };
}

function buildLifecycleRecommendations(objects, blockers, storageThresholdStatus) {
  const recommendations = [];
  if (blockers.length > 0) {
    recommendations.push("Resolve missing objects, outside-root paths, missing hashes, and hash mismatches before lifecycle cleanup.");
  }
  if (objects.some((item) => item.actions.includes("review_stale_draft_retention"))) {
    recommendations.push("Review stale draft files before archive or cleanup; do not delete without owner approval.");
  }
  if (objects.some((item) => item.releasedProtected)) {
    recommendations.push("Keep released official files protected from draft cleanup and automatic delete policies.");
  }
  if (objects.some((item) => item.overUploadLimit)) {
    recommendations.push("Require Admin override or alternate upload path for files above the configured max upload size.");
  }
  if (storageThresholdStatus !== "ok") {
    recommendations.push("Storage threshold is above configured warning or critical percentage; prioritize lifecycle review and provider migration planning.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Lifecycle policy has no immediate action candidates; keep monthly evidence monitoring enabled.");
  }
  return recommendations;
}

export async function writeStorageLifecyclePolicyDryRun(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-lifecycle-policy-dry-run.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-lifecycle-policy-dry-run.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = { outputDir: "", now: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--now") parsed.now = argv[++index];
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageLifecyclePolicyDryRun({
    now: args.now
  });
  if (args.outputDir) {
    await writeStorageLifecyclePolicyDryRun(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
