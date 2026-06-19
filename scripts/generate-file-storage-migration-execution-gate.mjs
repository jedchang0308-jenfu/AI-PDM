#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildStorageMigrationRunbook } from "./generate-file-storage-migration-runbook.mjs";

const DEFAULT_TARGET_MODE = "local_staging_directory";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function ensureInside(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(root + path.sep);
}

function safeRelative(rootDir, targetPath) {
  return path.relative(path.resolve(rootDir), path.resolve(targetPath)).split(path.sep).join("/");
}

function statusReason(status) {
  if (status === "disabled") return "set PDM_STORAGE_MIGRATION_EXECUTE_ENABLED=1 and pass --confirm-staging";
  if (status === "blocked") return "resolve dry-run blockers before copying objects";
  if (status === "blocked_missing_governance_gate") return "provide a current file-storage governance gate before staging copy";
  if (status === "blocked_invalid_governance_gate") return "provide a valid file-storage governance gate report";
  if (status === "blocked_governance_not_ready") return "resolve governance evidence blockers before staging copy";
  if (status === "unsupported_target_mode") return "only local_staging_directory target mode is executable in this gate";
  if (status === "no_op") return "no planned objects were available";
  return "staging execution completed with hash verification";
}

function resolveOptionalPath(root, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(root, raw);
}

async function readGovernanceGate(root, governanceGatePath) {
  const resolvedPath = resolveOptionalPath(root, governanceGatePath);
  if (!resolvedPath) {
    return {
      available: false,
      path: "",
      reportType: "",
      status: "missing",
      governanceLevel: "",
      governanceLabel: "",
      reason: "governance gate path was not provided",
      readyForStagingCopy: false,
      evidenceQuality: {
        excludedQcRuntimeRows: 0,
        legacyUnclassifiedRows: 0,
        provenanceReviewRequired: false,
        qcRuntimeRowsExcluded: false
      },
      readiness: null,
      decisions: null
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(resolvedPath, "utf8"));
  } catch (error) {
    return {
      available: false,
      path: resolvedPath,
      reportType: "",
      status: "unreadable",
      governanceLevel: "",
      governanceLabel: "",
      reason: error && typeof error === "object" && "code" in error ? String(error.code) : "invalid_json",
      readyForStagingCopy: false,
      evidenceQuality: {
        excludedQcRuntimeRows: 0,
        legacyUnclassifiedRows: 0,
        provenanceReviewRequired: false,
        qcRuntimeRowsExcluded: false
      },
      readiness: null,
      decisions: null
    };
  }

  if (!parsed || parsed.reportType !== "file-storage-governance-gate") {
    return {
      available: false,
      path: resolvedPath,
      reportType: String(parsed?.reportType ?? ""),
      status: "invalid_schema",
      governanceLevel: "",
      governanceLabel: "",
      reason: "reportType must be file-storage-governance-gate",
      readyForStagingCopy: false,
      evidenceQuality: {
        excludedQcRuntimeRows: 0,
        legacyUnclassifiedRows: 0,
        provenanceReviewRequired: false,
        qcRuntimeRowsExcluded: false
      },
      readiness: null,
      decisions: null
    };
  }

  const status = String(parsed.summary?.status ?? "");
  const evidenceQuality = parsed.evidenceQuality ?? {};
  const readiness = parsed.readiness ?? null;
  const legacyUnclassifiedRows = Number(evidenceQuality.legacyUnclassifiedRows ?? 0);
  const provenanceReviewRequired = evidenceQuality.provenanceReviewRequired === true || legacyUnclassifiedRows > 0;
  const migrationReady = readiness?.migrationReady === true;
  const blockerCount = Array.isArray(readiness?.blockers) ? readiness.blockers.length : Number(parsed.summary?.blockerCount ?? 0);
  const sourceAvailable = parsed.source?.available === true;
  const allowedStatus = status === "stable" || status === "cost_controls_required";
  const readyForStagingCopy = sourceAvailable && migrationReady && blockerCount === 0 && !provenanceReviewRequired && allowedStatus;

  let reason = "governance evidence permits staging copy";
  if (!sourceAvailable) reason = "governance source evidence is missing";
  else if (!migrationReady || blockerCount > 0) reason = "governance readiness still has migration blockers";
  else if (provenanceReviewRequired) reason = "governance evidence still requires provenance review";
  else if (!allowedStatus) reason = `governance status ${status || "unknown"} does not permit staging copy`;

  return {
    available: true,
    path: resolvedPath,
    reportType: parsed.reportType,
    status,
    governanceLevel: String(parsed.summary?.governanceLevel ?? ""),
    governanceLabel: String(parsed.summary?.governanceLabel ?? ""),
    reason,
    readyForStagingCopy,
    evidenceQuality: {
      excludedQcRuntimeRows: Number(evidenceQuality.excludedQcRuntimeRows ?? 0),
      legacyUnclassifiedRows,
      provenanceReviewRequired,
      qcRuntimeRowsExcluded: evidenceQuality.qcRuntimeRowsExcluded === true
    },
    readiness: readiness
      ? {
          migrationReady,
          blockerCount,
          warningCount: Array.isArray(readiness.warnings) ? readiness.warnings.length : Number(parsed.summary?.warningCount ?? 0)
        }
      : null,
    decisions: parsed.decisions ?? null
  };
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Migration Execution Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Planned objects: ${report.summary.plannedCount}`,
    `- Copied objects: ${report.summary.copiedCount}`,
    `- Hash verified objects: ${report.summary.hashVerifiedCount}`,
    `- Rollback verified objects: ${report.summary.rollbackVerifiedCount}`,
    `- Blocked objects: ${report.summary.blockedCount}`,
    "",
    "## Guardrails",
    "",
    `- Explicit enable required: ${report.assumptions.explicitEnableRequired}`,
    `- Staging confirmation required: ${report.assumptions.stagingConfirmationRequired}`,
    `- Governance gate required: ${report.assumptions.governanceGateRequired}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    `- No source files deleted: ${report.assumptions.noSourceFilesDeleted}`,
    `- Provider requests disabled: ${report.assumptions.providerRequestsDisabled}`,
    "",
    "## Governance Gate",
    "",
    `- Available: ${report.governanceGate.available}`,
    `- Status: ${report.governanceGate.status}`,
    `- Governance level: ${report.governanceGate.governanceLevel || "-"}`,
    `- Ready for staging copy: ${report.governanceGate.readyForStagingCopy}`,
    `- Reason: ${report.governanceGate.reason}`,
    `- Provenance review required: ${report.governanceGate.evidenceQuality.provenanceReviewRequired}`,
    "",
    "## Copied Objects",
    ""
  ];

  if (report.copied.length === 0) {
    lines.push("- No objects were copied.");
  } else {
    for (const item of report.copied) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename} -> ${item.targetPath} (${item.sha256})`);
    }
  }

  if (report.rollbackVerification.length > 0) {
    lines.push("", "## Rollback Verification", "");
    for (const item of report.rollbackVerification) {
      lines.push(`- ${item.table}/${item.id}: ${item.rollbackProvider}/${item.rollbackStorageKey ?? item.rollbackLocalPath} hashVerified=${item.hashVerified}`);
    }
  }

  if (report.blocked.length > 0) {
    lines.push("", "## Blockers", "");
    for (const item of report.blocked) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename ?? "-"} (${item.reason})`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, status, governanceGate) {
  return {
    reportType: "file-storage-migration-execution-gate",
    generatedAt: new Date().toISOString(),
    assumptions: {
      explicitEnableRequired: true,
      stagingConfirmationRequired: true,
      governanceGateRequired: true,
      noMetadataPointersUpdated: true,
      noSourceFilesDeleted: true,
      noSourceFilesModified: true,
      noProviderDeletes: true,
      providerRequestsDisabled: targetMode === DEFAULT_TARGET_MODE,
      localStagingTargetOnly: true
    },
    inputs: {
      targetMode,
      targetRoot,
      enabled,
      confirmStaging,
      governanceGatePath: governanceGate.path
    },
    governanceGate,
    sourceRunbook: {
      reportType: runbook.reportType,
      generatedAt: runbook.generatedAt,
      readiness: runbook.readiness,
      summary: runbook.summary
    },
    readiness: {
      readyToCopy: false,
      reason: governanceGate.available && !governanceGate.readyForStagingCopy ? governanceGate.reason : statusReason(status)
    },
    summary: {
      status,
      plannedCount: runbook.summary.plannedCount,
      copiedCount: 0,
      hashVerifiedCount: 0,
      rollbackVerifiedCount: 0,
      blockedCount: runbook.summary.blockedCount,
      skippedCount: runbook.summary.skippedCount
    },
    copied: [],
    rollbackVerification: [],
    blocked: runbook.blocked,
    skipped: runbook.skipped
  };
}

export async function buildStorageMigrationExecutionGate(options = {}) {
  const env = options.env ?? process.env;
  const root = options.root ?? process.cwd();
  const enabled = options.enabled ?? env.PDM_STORAGE_MIGRATION_EXECUTE_ENABLED === "1";
  const confirmStaging = options.confirmStaging === true;
  const targetMode = options.targetMode ?? env.PDM_STORAGE_MIGRATION_EXECUTE_TARGET_MODE ?? DEFAULT_TARGET_MODE;
  const runbook = buildStorageMigrationRunbook(options);
  const governanceGate = await readGovernanceGate(root, options.governanceGatePath ?? env.PDM_STORAGE_GOVERNANCE_GATE_PATH);
  const targetRoot = path.resolve(
    options.targetRoot ?? env.PDM_STORAGE_MIGRATION_EXECUTE_TARGET_ROOT ?? path.join(process.cwd(), "data", "storage-migration-staging-target")
  );

  if (!enabled || !confirmStaging) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "disabled", governanceGate);
  }

  if (!governanceGate.path) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "blocked_missing_governance_gate", governanceGate);
  }

  if (!governanceGate.available) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "blocked_invalid_governance_gate", governanceGate);
  }

  if (!governanceGate.readyForStagingCopy) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "blocked_governance_not_ready", governanceGate);
  }

  if (targetMode !== DEFAULT_TARGET_MODE) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "unsupported_target_mode", governanceGate);
  }

  if (runbook.summary.blockedCount > 0) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "blocked", governanceGate);
  }

  if (runbook.summary.plannedCount === 0) {
    return buildDisabledReport(runbook, targetRoot, targetMode, enabled, confirmStaging, "no_op", governanceGate);
  }

  const copied = [];
  const rollbackVerification = [];
  await fsp.mkdir(targetRoot, { recursive: true });

  for (const batch of runbook.plannedBatches) {
    for (const item of batch.objects) {
      const sourcePlan = runbook.pointerRollbackPlan.find((entry) => entry.id === item.id && entry.source === item.source);
      const sourcePath = sourcePlan?.rollbackLocalPath;
      if (!sourcePath) {
        throw new Error(`Missing rollbackLocalPath for ${item.source}/${item.id}`);
      }
      const actualSourceHash = sha256File(sourcePath);
      if (actualSourceHash !== item.sha256) {
        throw new Error(`Source hash changed before execution for ${item.source}/${item.id}`);
      }

      const targetPath = path.resolve(targetRoot, item.targetKey);
      if (!ensureInside(targetRoot, targetPath)) {
        throw new Error(`Target key resolves outside staging target for ${item.source}/${item.id}`);
      }

      await fsp.mkdir(path.dirname(targetPath), { recursive: true });
      await fsp.copyFile(sourcePath, targetPath);
      const stat = await fsp.stat(targetPath);
      const copiedHash = sha256File(targetPath);
      copied.push({
        id: item.id,
        source: item.source,
        filename: item.filename,
        targetProvider: item.targetProvider,
        targetBucket: item.targetBucket,
        targetKey: item.targetKey,
        targetPath: safeRelative(process.cwd(), targetPath),
        bytes: stat.size,
        sha256: copiedHash,
        expectedSha256: item.sha256,
        hashVerified: copiedHash === item.sha256
      });
    }
  }

  for (const item of runbook.pointerRollbackPlan) {
    const rollbackPath = item.rollbackLocalPath;
    const rollbackHash = rollbackPath && fs.existsSync(rollbackPath) ? sha256File(rollbackPath) : "";
    rollbackVerification.push({
      table: item.table,
      id: item.id,
      source: item.source,
      rollbackProvider: item.rollbackProvider,
      rollbackStorageKey: item.rollbackStorageKey,
      rollbackLocalPath: item.rollbackLocalPath,
      proposedProvider: item.proposedProvider,
      proposedBucket: item.proposedBucket,
      proposedStorageKey: item.proposedStorageKey,
      expectedSha256: item.sha256,
      actualSha256: rollbackHash,
      hashVerified: rollbackHash === item.sha256
    });
  }

  const hashVerifiedCount = copied.filter((item) => item.hashVerified).length;
  const rollbackVerifiedCount = rollbackVerification.filter((item) => item.hashVerified).length;
  return {
    reportType: "file-storage-migration-execution-gate",
    generatedAt: new Date().toISOString(),
    assumptions: {
      explicitEnableRequired: true,
      stagingConfirmationRequired: true,
      governanceGateRequired: true,
      noMetadataPointersUpdated: true,
      noSourceFilesDeleted: true,
      noSourceFilesModified: true,
      noProviderDeletes: true,
      providerRequestsDisabled: true,
      localStagingTargetOnly: true
    },
    inputs: {
      targetMode,
      targetRoot,
      enabled,
      confirmStaging,
      governanceGatePath: governanceGate.path
    },
    governanceGate,
    sourceRunbook: {
      reportType: runbook.reportType,
      generatedAt: runbook.generatedAt,
      readiness: runbook.readiness,
      summary: runbook.summary
    },
    readiness: {
      readyToCopy: true,
      reason: statusReason("executed")
    },
    summary: {
      status: "executed",
      plannedCount: runbook.summary.plannedCount,
      copiedCount: copied.length,
      hashVerifiedCount,
      rollbackVerifiedCount,
      blockedCount: runbook.summary.blockedCount,
      skippedCount: runbook.summary.skippedCount
    },
    copied,
    rollbackVerification,
    blocked: runbook.blocked,
    skipped: runbook.skipped
  };
}

export async function writeStorageMigrationExecutionGate(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-migration-execution-gate.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-migration-execution-gate.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    targetRoot: "",
    targetMode: undefined,
    confirmStaging: false,
    targetProvider: undefined,
    targetBucket: undefined,
    targetPrefix: undefined,
    batchSize: undefined,
    governanceGatePath: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--target-root") parsed.targetRoot = argv[++index] ?? "";
    else if (arg === "--target-mode") parsed.targetMode = argv[++index];
    else if (arg === "--confirm-staging") parsed.confirmStaging = true;
    else if (arg === "--target-provider") parsed.targetProvider = argv[++index];
    else if (arg === "--target-bucket") parsed.targetBucket = argv[++index];
    else if (arg === "--target-prefix") parsed.targetPrefix = argv[++index];
    else if (arg === "--batch-size") parsed.batchSize = Number.parseInt(argv[++index] ?? "", 10) || undefined;
    else if (arg === "--governance-gate") parsed.governanceGatePath = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageMigrationExecutionGate({
    targetRoot: args.targetRoot || undefined,
    targetMode: args.targetMode,
    confirmStaging: args.confirmStaging,
    targetProvider: args.targetProvider,
    targetBucket: args.targetBucket,
    targetPrefix: args.targetPrefix,
    batchSize: args.batchSize,
    governanceGatePath: args.governanceGatePath || undefined
  });
  if (args.outputDir) {
    await writeStorageMigrationExecutionGate(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
