import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

type StorageEvidenceStatus = "ok" | "warning" | "blocked" | "missing" | "invalid";

type StorageEvidenceSummary = {
  metadataObjectCount: number;
  metadataStorageBytes: number;
  metadataStorageGb: number;
  scannedLocalRootsBytes: number;
  scannedLocalRootsGb: number;
  duplicateRecoverableBytes: number;
  missingLocalObjectCount: number;
  hashMismatchCount: number;
  orphanLocalFileCount: number;
  auditedEgressRows: number;
  auditedEgressBytes: number;
  auditedEgressGb: number;
  publicShareEgressBytes: number;
  excludedQcRuntimeRows: number;
  legacyUnclassifiedRows: number;
};

type StorageEvidenceReadiness = {
  migrationReady: boolean;
  blockers: string[];
  warnings: string[];
};

type StorageGovernanceLevel = "stable" | "observe" | "review" | "control" | "blocked";

type StorageEvidenceGovernance = {
  level: StorageGovernanceLevel;
  label: string;
  reason: string;
  storageUsageRatio: number | null;
  egressUsageRatio: number | null;
  providerMigrationAllowed: boolean;
  lifecycleCleanupAllowed: boolean;
  alternateProviderReviewRecommended: boolean;
  nextReviewTrigger: string;
};

type StorageEvidenceRunManifest = {
  reportType: string;
  taskId: string;
  runId: string;
  generatedAt: string;
  period: string;
  status: StorageEvidenceStatus;
  suggestedExitCode: number;
  outputDir: string;
  files?: {
    evidenceJson?: string | null;
    evidenceMarkdown?: string | null;
    runManifest?: string | null;
    latestManifest?: string | null;
  };
  summary: StorageEvidenceSummary;
  readiness: StorageEvidenceReadiness;
  thresholdUsage?: unknown;
  recommendationCount: number;
};

export type StorageEvidenceDashboard = {
  reportType: "file-storage-evidence-dashboard";
  generatedAt: string;
  source: {
    available: boolean;
    latestManifestPath: string;
    runManifestPath: string | null;
    evidenceMarkdownPath: string | null;
    evidenceJsonPath: string | null;
    error: string | null;
  };
  run: null | {
    runId: string;
    taskId: string;
    period: string;
    generatedAt: string;
    status: StorageEvidenceStatus;
    severity: "normal" | "warning" | "critical" | "unknown";
    suggestedExitCode: number;
  };
  summary: null | StorageEvidenceSummary;
  readiness: null | StorageEvidenceReadiness;
  thresholdUsage: unknown;
  governance: null | StorageEvidenceGovernance;
  recommendationCount: number;
  nextActions: string[];
};

function configuredEvidenceRoot(root: string, env: NodeJS.ProcessEnv) {
  const configured = env.PDM_STORAGE_EVIDENCE_LATEST_MANIFEST?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
  const reportDir = env.PDM_REPORT_DIR?.trim();
  const dataDir = env.PDM_DATA_DIR?.trim();
  const base = reportDir ? resolvePath(root, reportDir) : dataDir ? resolvePath(root, dataDir) : path.resolve(root, "data");
  return path.join(base, "storage-monthly-evidence", "latest-storage-monthly-evidence-run.json");
}

function resolvePath(root: string, value: string) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function resolveManifestFile(root: string, latestManifestPath: string, value?: string | null) {
  if (!value) return null;
  if (path.isAbsolute(value)) return value;
  const fromRoot = path.resolve(root, value);
  if (!path.relative(root, fromRoot).startsWith("..") && fs.existsSync(fromRoot)) return fromRoot;
  const latestDir = path.dirname(latestManifestPath);
  const fromLatest = path.resolve(latestDir, value);
  if (!path.relative(root, fromLatest).startsWith("..")) return fromLatest;
  return fromRoot;
}

function severityFromStatus(status: StorageEvidenceStatus) {
  if (status === "blocked") return "critical";
  if (status === "warning") return "warning";
  if (status === "ok") return "normal";
  return "unknown";
}

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "")).filter(Boolean).slice(0, 20);
}

function normalizeSummary(value: unknown): StorageEvidenceSummary {
  const source = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  return {
    metadataObjectCount: Number(source.metadataObjectCount ?? 0),
    metadataStorageBytes: Number(source.metadataStorageBytes ?? 0),
    metadataStorageGb: Number(source.metadataStorageGb ?? 0),
    scannedLocalRootsBytes: Number(source.scannedLocalRootsBytes ?? 0),
    scannedLocalRootsGb: Number(source.scannedLocalRootsGb ?? 0),
    duplicateRecoverableBytes: Number(source.duplicateRecoverableBytes ?? 0),
    missingLocalObjectCount: Number(source.missingLocalObjectCount ?? 0),
    hashMismatchCount: Number(source.hashMismatchCount ?? 0),
    orphanLocalFileCount: Number(source.orphanLocalFileCount ?? 0),
    auditedEgressRows: Number(source.auditedEgressRows ?? 0),
    auditedEgressBytes: Number(source.auditedEgressBytes ?? 0),
    auditedEgressGb: Number(source.auditedEgressGb ?? 0),
    publicShareEgressBytes: Number(source.publicShareEgressBytes ?? 0),
    excludedQcRuntimeRows: Number(source.excludedQcRuntimeRows ?? 0),
    legacyUnclassifiedRows: Number(source.legacyUnclassifiedRows ?? 0)
  };
}

function normalizeReadiness(value: unknown): StorageEvidenceReadiness {
  const source = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  return {
    migrationReady: source.migrationReady === true,
    blockers: sanitizeStringList(source.blockers),
    warnings: sanitizeStringList(source.warnings)
  };
}

function ratioFromThresholdUsage(thresholdUsage: unknown, key: "storage" | "egress") {
  const source = typeof thresholdUsage === "object" && thresholdUsage ? (thresholdUsage as Record<string, unknown>) : {};
  const bucket = typeof source[key] === "object" && source[key] ? (source[key] as Record<string, unknown>) : {};
  const ratio = Number(bucket.usageRatio);
  return Number.isFinite(ratio) ? ratio : null;
}

function normalizeManifest(value: unknown): StorageEvidenceRunManifest | null {
  const source = typeof value === "object" && value ? (value as Record<string, unknown>) : null;
  if (!source || source.reportType !== "file-storage-monthly-evidence-scheduled-run") return null;
  const status = ["ok", "warning", "blocked"].includes(String(source.status)) ? (source.status as StorageEvidenceStatus) : "invalid";
  return {
    reportType: String(source.reportType),
    taskId: String(source.taskId ?? ""),
    runId: String(source.runId ?? ""),
    generatedAt: String(source.generatedAt ?? ""),
    period: String(source.period ?? ""),
    status,
    suggestedExitCode: Number(source.suggestedExitCode ?? 0),
    outputDir: String(source.outputDir ?? ""),
    files: source.files as StorageEvidenceRunManifest["files"],
    summary: normalizeSummary(source.summary),
    readiness: normalizeReadiness(source.readiness),
    thresholdUsage: source.thresholdUsage ?? null,
    recommendationCount: Number(source.recommendationCount ?? 0)
  };
}

function nextActionsFor(manifest: StorageEvidenceRunManifest) {
  const actions: string[] = [];
  if (manifest.readiness.blockers.length > 0) {
    actions.push("Resolve storage blockers before provider migration or lifecycle cleanup.");
  }
  if (manifest.summary.auditedEgressRows === 0) {
    actions.push("Keep observation mode until real StorageAccessed rows exist.");
  }
  if (manifest.summary.publicShareEgressBytes > 0) {
    actions.push("Review public share expiry and supplier package size.");
  }
  if (manifest.summary.legacyUnclassifiedRows > 0) {
    actions.push("Review legacy StorageAccessed rows before using evidence for monthly cost decisions.");
  }
  if (manifest.status === "ok") {
    actions.push("Keep monthly evidence schedule active and review threshold trends.");
  }
  return actions.length ? actions : ["Review latest monthly evidence before changing storage provider policy."];
}

function governanceFor(manifest: StorageEvidenceRunManifest): StorageEvidenceGovernance {
  const storageUsageRatio = ratioFromThresholdUsage(manifest.thresholdUsage, "storage");
  const egressUsageRatio = ratioFromThresholdUsage(manifest.thresholdUsage, "egress");
  const maxRatio = Math.max(storageUsageRatio ?? 0, egressUsageRatio ?? 0);

  if (manifest.readiness.blockers.length > 0) {
    return {
      level: "blocked",
      label: "Migration blocked",
      reason: "Storage integrity blockers must be cleared before migration, cleanup, or provider cutover.",
      storageUsageRatio,
      egressUsageRatio,
      providerMigrationAllowed: false,
      lifecycleCleanupAllowed: false,
      alternateProviderReviewRecommended: false,
      nextReviewTrigger: "Clear all storage evidence blockers and regenerate monthly evidence."
    };
  }

  if (maxRatio >= 0.9) {
    return {
      level: "control",
      label: "Cost controls required",
      reason: "Storage or egress usage is at or above the critical threshold.",
      storageUsageRatio,
      egressUsageRatio,
      providerMigrationAllowed: true,
      lifecycleCleanupAllowed: true,
      alternateProviderReviewRecommended: true,
      nextReviewTrigger: "Open provider cost review and lifecycle cleanup approval before the next billing cycle."
    };
  }

  if (
    maxRatio >= 0.7 ||
    (egressUsageRatio ?? 0) >= 0.6 ||
    manifest.summary.publicShareEgressBytes > 0 ||
    manifest.summary.legacyUnclassifiedRows > 0
  ) {
    return {
      level: "review",
      label: manifest.summary.legacyUnclassifiedRows > 0 ? "Evidence provenance review required" : "Cost review required",
      reason:
        manifest.summary.legacyUnclassifiedRows > 0
          ? "Some audited egress rows predate provenance and must be reviewed before formal monthly cost decisions."
          : "Usage or public-share egress is approaching the policy threshold.",
      storageUsageRatio,
      egressUsageRatio,
      providerMigrationAllowed: false,
      lifecycleCleanupAllowed: true,
      alternateProviderReviewRecommended: manifest.summary.legacyUnclassifiedRows > 0 ? false : true,
      nextReviewTrigger:
        manifest.summary.legacyUnclassifiedRows > 0
          ? "Classify legacy StorageAccessed rows or regenerate evidence from provenance-aware runtime logs."
          : "Review lifecycle, deduplication, public share expiry, and alternate provider options."
    };
  }

  if (manifest.summary.auditedEgressRows === 0) {
    return {
      level: "observe",
      label: "Observation mode",
      reason: "No audited egress rows exist yet, so cost controls are not proven with real usage.",
      storageUsageRatio,
      egressUsageRatio,
      providerMigrationAllowed: false,
      lifecycleCleanupAllowed: false,
      alternateProviderReviewRecommended: false,
      nextReviewTrigger: "Keep monthly evidence schedule active until real download and share activity is captured."
    };
  }

  return {
    level: "stable",
    label: "Stable",
    reason: "Storage evidence is under threshold and has no migration blockers.",
    storageUsageRatio,
    egressUsageRatio,
    providerMigrationAllowed: false,
    lifecycleCleanupAllowed: true,
    alternateProviderReviewRecommended: false,
    nextReviewTrigger: "Continue monthly evidence review."
  };
}

function missingDashboard(latestManifestPath: string, error: string): StorageEvidenceDashboard {
  return {
    reportType: "file-storage-evidence-dashboard",
    generatedAt: new Date().toISOString(),
    source: {
      available: false,
      latestManifestPath,
      runManifestPath: null,
      evidenceMarkdownPath: null,
      evidenceJsonPath: null,
      error
    },
    run: null,
    summary: null,
    readiness: null,
    thresholdUsage: null,
    governance: null,
    recommendationCount: 0,
    nextActions: ["Run npm.cmd run storage:monthly-evidence:scheduled to create the first evidence manifest."]
  };
}

export async function getStorageEvidenceDashboard(options: {
  root?: string;
  env?: NodeJS.ProcessEnv;
  latestManifestPath?: string;
} = {}): Promise<StorageEvidenceDashboard> {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const latestManifestPath = options.latestManifestPath
    ? resolvePath(root, options.latestManifestPath)
    : configuredEvidenceRoot(root, env);

  let raw = "";
  try {
    raw = await fsp.readFile(latestManifestPath, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
    return missingDashboard(latestManifestPath, code === "ENOENT" ? "latest_manifest_missing" : "latest_manifest_unreadable");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return missingDashboard(latestManifestPath, "latest_manifest_invalid_json");
  }

  const manifest = normalizeManifest(parsed);
  if (!manifest) return missingDashboard(latestManifestPath, "latest_manifest_invalid_schema");

  const evidenceJsonPath = resolveManifestFile(root, latestManifestPath, manifest.files?.evidenceJson);
  const evidenceMarkdownPath = resolveManifestFile(root, latestManifestPath, manifest.files?.evidenceMarkdown);
  const runManifestPath = resolveManifestFile(root, latestManifestPath, manifest.files?.runManifest) ?? latestManifestPath;

  return {
    reportType: "file-storage-evidence-dashboard",
    generatedAt: new Date().toISOString(),
    source: {
      available: true,
      latestManifestPath,
      runManifestPath,
      evidenceMarkdownPath,
      evidenceJsonPath,
      error: null
    },
    run: {
      runId: manifest.runId,
      taskId: manifest.taskId,
      period: manifest.period,
      generatedAt: manifest.generatedAt,
      status: manifest.status,
      severity: severityFromStatus(manifest.status),
      suggestedExitCode: manifest.suggestedExitCode
    },
    summary: manifest.summary,
    readiness: manifest.readiness,
    thresholdUsage: manifest.thresholdUsage,
    governance: governanceFor(manifest),
    recommendationCount: manifest.recommendationCount,
    nextActions: nextActionsFor(manifest)
  };
}
