#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageMigrationDryRun } from "./generate-file-storage-migration-dry-run.mjs";

const DEFAULT_BATCH_SIZE = 100;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildPlannedBatches(planned, batchSize) {
  return chunk(planned, batchSize).map((items, index) => ({
    batchNumber: index + 1,
    objectCount: items.length,
    totalBytes: items.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
    objectIds: items.map((item) => item.id),
    objects: items.map((item) => ({
      id: item.id,
      source: item.source,
      filename: item.filename,
      targetProvider: item.targetProvider,
      targetBucket: item.targetBucket,
      targetKey: item.targetKey,
      bytes: item.bytes,
      sha256: item.sha256
    }))
  }));
}

function buildPointerRollbackPlan(planned) {
  return planned.map((item) => ({
    table: item.pointerPreview?.table ?? item.source,
    id: item.id,
    source: item.source,
    filename: item.filename,
    rollbackProvider: item.sourceProvider,
    rollbackStorageKey: item.sourceKey,
    rollbackLocalPath: item.sourceLocalPath,
    proposedProvider: item.targetProvider,
    proposedBucket: item.targetBucket,
    proposedStorageKey: item.targetKey,
    sha256: item.sha256,
    bytes: item.bytes
  }));
}

function buildExecuteChecklist() {
  return [
    {
      step: 1,
      title: "Review dry-run evidence and resolve blockers",
      evidence: ["migration dry-run JSON", "blocked object list", "approval record"],
      gate: "blockedCount must be 0 before live execution"
    },
    {
      step: 2,
      title: "Attach current storage governance gate evidence",
      evidence: ["file-storage-governance-gate JSON", "evidence quality section", "provenance review state"],
      gate: "governance gate must be valid, migration-ready, and free of provenance-review blockers"
    },
    {
      step: 3,
      title: "Configure target provider credentials in server-only runtime",
      evidence: ["server env inventory", "least-privilege bucket policy"],
      gate: "credentials must not be stored in generated runbook output"
    },
    {
      step: 4,
      title: "Copy planned objects batch by batch to target provider",
      evidence: ["provider object key", "bytes written", "copy timestamp"],
      gate: "copy does not update metadata pointer"
    },
    {
      step: 5,
      title: "Verify target object hash before pointer update",
      evidence: ["expected SHA-256", "actual SHA-256", "byte count"],
      gate: "actual SHA-256 must equal planned sha256"
    },
    {
      step: 6,
      title: "Update metadata pointer only after full batch verification",
      evidence: ["old pointer", "new provider", "new bucket", "new storage key", "operator approval"],
      gate: "rollback plan must be attached before pointer update"
    },
    {
      step: 7,
      title: "Keep source files until post-migration audit closes",
      evidence: ["source retention window", "post-migration download smoke result"],
      gate: "no source deletion during execute window"
    }
  ];
}

function buildVerifyChecklist() {
  return [
    {
      check: "target_object_exists",
      requirement: "Every planned target key exists in the target provider and bucket."
    },
    {
      check: "target_hash_matches",
      requirement: "Downloaded or provider-reported object SHA-256 matches planned sha256 before metadata pointer update."
    },
    {
      check: "target_bytes_match",
      requirement: "Target object byte count matches planned bytes."
    },
    {
      check: "server_download_smoke",
      requirement: "Authenticated server download API can fetch a sample migrated object without exposing provider credentials."
    },
    {
      check: "public_share_smoke",
      requirement: "Public share package access remains read-only and does not expose signed URL internals."
    },
    {
      check: "audit_evidence_complete",
      requirement: "Batch evidence records old pointer, new pointer, hash result, operator, and approval timestamp."
    }
  ];
}

function buildRollbackChecklist() {
  return [
    {
      step: 1,
      title: "Freeze writes for affected objects",
      evidence: ["affected object ids", "freeze start timestamp"]
    },
    {
      step: 2,
      title: "Restore metadata pointer to rollback provider and storage key",
      evidence: ["pointer rollback plan", "old local path", "rollback storage key"]
    },
    {
      step: 3,
      title: "Verify local source SHA-256 before reopening access",
      evidence: ["expected SHA-256", "local SHA-256", "byte count"]
    },
    {
      step: 4,
      title: "Run authenticated download and public share smoke tests",
      evidence: ["server API smoke", "public share smoke", "permission audit"]
    },
    {
      step: 5,
      title: "Keep target copies until rollback audit is closed",
      evidence: ["retention decision", "operator approval"]
    }
  ];
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Migration Runbook",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Planned objects: ${report.summary.plannedCount}`,
    `- Planned bytes: ${report.summary.plannedBytes}`,
    `- Blocked objects: ${report.summary.blockedCount}`,
    `- Skipped objects: ${report.summary.skippedCount}`,
    `- Ready to execute: ${report.readiness.readyToExecute}`,
    "",
    "## Guardrails",
    "",
    `- Runbook only: ${report.assumptions.runbookOnly}`,
    `- No provider migration executed: ${report.assumptions.noProviderMigrationExecuted}`,
    `- No files copied: ${report.assumptions.noFilesCopied}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    `- Execution requires explicit approval: ${report.assumptions.executeRequiresExplicitApproval}`,
    `- Governance gate required for execution: ${report.assumptions.governanceGateRequiredForExecution}`,
    "",
    "## Execution Checklist",
    ""
  ];

  for (const item of report.executeChecklist) {
    lines.push(`- ${item.step}. ${item.title} (gate: ${item.gate})`);
  }

  lines.push("", "## Verification Checklist", "");
  for (const item of report.verifyChecklist) {
    lines.push(`- ${item.check}: ${item.requirement}`);
  }

  lines.push("", "## Rollback Checklist", "");
  for (const item of report.rollbackChecklist) {
    lines.push(`- ${item.step}. ${item.title}`);
  }

  lines.push("", "## Pointer Rollback Plan", "");
  if (report.pointerRollbackPlan.length === 0) {
    lines.push("- No planned objects require pointer rollback entries.");
  } else {
    for (const item of report.pointerRollbackPlan) {
      lines.push(`- ${item.table}/${item.id}: ${item.proposedProvider}/${item.proposedStorageKey} -> ${item.rollbackProvider}/${item.rollbackStorageKey ?? item.rollbackLocalPath}`);
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

export function buildStorageMigrationRunbook(options = {}) {
  const env = options.env ?? process.env;
  const batchSize = options.batchSize ?? parsePositiveInt(env.PDM_STORAGE_MIGRATION_RUNBOOK_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const dryRun = buildStorageMigrationDryRun(options);
  const blockedReasons = unique(dryRun.blocked.map((item) => item.reason));
  const readyToExecute = dryRun.summary.plannedCount > 0 && dryRun.summary.blockedCount === 0;

  return {
    reportType: "file-storage-migration-runbook",
    generatedAt: new Date().toISOString(),
    sourceDryRun: {
      reportType: dryRun.reportType,
      generatedAt: dryRun.generatedAt,
      summary: dryRun.summary,
      assumptions: dryRun.assumptions
    },
    assumptions: {
      runbookOnly: true,
      noProviderMigrationExecuted: true,
      noFilesCopied: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true,
      providerCredentialsRequiredForRunbook: false,
      providerCredentialsRequiredForExecution: true,
      executeRequiresExplicitApproval: true,
      governanceGateRequiredForExecution: true,
      rollbackPlanRequiredBeforePointerUpdate: true
    },
    target: dryRun.target,
    readiness: {
      readyToExecute,
      requiresApproval: true,
      requiresGovernanceGate: true,
      blockedReasons,
      nextAction: readyToExecute ? "generate_governance_gate_then_approve_staging_execution_gate" : "resolve_blockers_and_regenerate_runbook"
    },
    summary: {
      ...dryRun.summary,
      batchSize,
      batchCount: Math.ceil(dryRun.planned.length / batchSize)
    },
    commands: {
      regenerateDryRun: "npm.cmd run storage:migration-dry-run",
      regenerateRunbook: "npm.cmd run storage:migration-runbook -- --output <dir>",
      generateGovernanceGate: "npm.cmd run storage:governance-gate -- --output <dir>",
      stagingExecutionGate:
        "npm.cmd run storage:migration-execution-gate -- --output <dir> --confirm-staging --governance-gate <file-storage-governance-gate.json>",
      qcRunbook: "npm.cmd run qc:file-storage-migration-runbook",
      qcExecutionGate: "npm.cmd run qc:file-storage-migration-execution-gate",
      archiveRestoreDrill: "npm.cmd run storage:archive-restore-drill -- --output <dir>"
    },
    executeChecklist: buildExecuteChecklist(),
    verifyChecklist: buildVerifyChecklist(),
    rollbackChecklist: buildRollbackChecklist(),
    plannedBatches: buildPlannedBatches(dryRun.planned, batchSize),
    pointerRollbackPlan: buildPointerRollbackPlan(dryRun.planned),
    blocked: dryRun.blocked,
    skipped: dryRun.skipped
  };
}

export async function writeStorageMigrationRunbook(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-migration-runbook.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-migration-runbook.md");
  const rollbackPlanPath = path.join(resolvedOutputDir, "storage-migration-pointer-rollback-plan.json");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  await fsp.writeFile(rollbackPlanPath, `${JSON.stringify(report.pointerRollbackPlan, null, 2)}\n`, "utf8");
  return { jsonPath, markdownPath, rollbackPlanPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    batchSize: undefined,
    targetProvider: undefined,
    targetBucket: undefined,
    targetPrefix: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--batch-size") parsed.batchSize = parsePositiveInt(argv[++index], DEFAULT_BATCH_SIZE);
    else if (arg === "--target-provider") parsed.targetProvider = argv[++index];
    else if (arg === "--target-bucket") parsed.targetBucket = argv[++index];
    else if (arg === "--target-prefix") parsed.targetPrefix = argv[++index];
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildStorageMigrationRunbook({
    batchSize: args.batchSize,
    targetProvider: args.targetProvider,
    targetBucket: args.targetBucket,
    targetPrefix: args.targetPrefix
  });
  if (args.outputDir) {
    await writeStorageMigrationRunbook(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
