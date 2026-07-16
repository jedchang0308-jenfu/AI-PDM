#!/usr/bin/env node

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildStorageMetadataContext } from "./generate-file-storage-cost-report.mjs";
import { safeRelative } from "./storage-metadata-normalizer.mjs";

const DEFAULT_LIMIT = 100;

async function sha256File(filePath) {
  return crypto.createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizePathPart(value) {
  return String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.\./g, "_")
    .trim();
}

function buildRestoreRelativePath(object) {
  const parts = [
    object.source,
    object.linkedEntityType ?? "unlinked",
    object.linkedEntityId ?? "unknown",
    object.hash ?? object.id,
    object.filename
  ];
  return parts.map(sanitizePathPart).filter(Boolean).join(path.sep);
}

function ensureInside(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(root + path.sep);
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Archive Restore Drill",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Metadata objects: ${report.summary.totalMetadataObjects}`,
    `- Restored objects: ${report.summary.restoredCount}`,
    `- Hash verified objects: ${report.summary.hashVerifiedCount}`,
    `- Blocked objects: ${report.summary.blockedCount}`,
    `- Skipped objects: ${report.summary.skippedCount}`,
    `- Restored bytes: ${report.summary.restoredBytes}`,
    "",
    "## Guardrails",
    "",
    `- No provider migration executed: ${report.assumptions.noProviderMigrationExecuted}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    `- No source files deleted: ${report.assumptions.noSourceFilesDeleted}`,
    `- Provider credentials required: ${report.assumptions.providerCredentialsRequired}`,
    "",
    "## Restored Objects",
    ""
  ];

  if (report.restored.length === 0) {
    lines.push("- No local objects were eligible for restore.");
  } else {
    for (const item of report.restored) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename} -> ${item.restorePath} (${item.sha256})`);
    }
  }

  if (report.blocked.length > 0) {
    lines.push("", "## Blocked Objects", "");
    for (const item of report.blocked) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename ?? "-"} (${item.reason})`);
    }
  }

  if (report.skipped.length > 0) {
    lines.push("", "## Skipped Objects", "");
    for (const item of report.skipped) {
      lines.push(`- ${item.source}/${item.id}: provider ${item.provider} (${item.reason})`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function buildStorageArchiveRestoreDrill(options = {}) {
  const env = options.env ?? process.env;
  const context = buildStorageMetadataContext(options);
  const limit = options.limit ?? parsePositiveInt(env.PDM_STORAGE_ARCHIVE_RESTORE_LIMIT, DEFAULT_LIMIT);
  const outputDir =
    options.outputDir ??
    path.join(context.dataDir, "storage-archive-restore-drills", timestampForPath(options.now ?? new Date()));
  const restoreTargetDir = options.restoreTargetDir ?? path.join(outputDir, "restore-target");
  const restored = [];
  const blocked = [];
  const skipped = [];

  await mkdir(restoreTargetDir, { recursive: true });

  for (const object of context.metadataObjects) {
    if (restored.length >= limit) {
      skipped.push({
        id: object.id,
        source: object.source,
        provider: object.provider,
        reason: "restore_limit_reached"
      });
      continue;
    }

    if (object.provider !== "local_repository") {
      skipped.push({
        id: object.id,
        source: object.source,
        provider: object.provider,
        reason: "source_provider_not_local_repository"
      });
      continue;
    }

    if (!object.pathForExistenceCheck) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "local_path_missing"
      });
      continue;
    }

    const localRoot = path.resolve(object.localRoot);
    const sourcePath = path.resolve(object.pathForExistenceCheck);
    if (!ensureInside(localRoot, sourcePath)) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "source_path_outside_local_root"
      });
      continue;
    }

    if (!existsSync(sourcePath)) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "source_file_missing"
      });
      continue;
    }

    if (!object.hash) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "sha256_missing"
      });
      continue;
    }

    const sourceHash = await sha256File(sourcePath);
    if (sourceHash !== object.hash) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "sha256_mismatch",
        expectedSha256: object.hash,
        actualSha256: sourceHash
      });
      continue;
    }

    const restorePath = path.join(restoreTargetDir, buildRestoreRelativePath(object));
    if (!ensureInside(restoreTargetDir, restorePath)) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "restore_path_outside_target"
      });
      continue;
    }

    await mkdir(path.dirname(restorePath), { recursive: true });
    await copyFile(sourcePath, restorePath);
    const restoredHash = await sha256File(restorePath);
    const fileStat = await stat(restorePath);
    restored.push({
      id: object.id,
      source: object.source,
      filename: object.filename,
      sourceProvider: object.provider,
      sourceKey: object.storageKey,
      sourcePath: safeRelative(context.root, sourcePath),
      restorePath: safeRelative(context.root, restorePath),
      bytes: fileStat.size,
      sha256: restoredHash,
      expectedSha256: object.hash,
      hashVerified: restoredHash === object.hash,
      lifecycleTier: object.lifecycleTier,
      linkedEntityType: object.linkedEntityType,
      linkedEntityId: object.linkedEntityId
    });
  }

  const restoredBytes = restored.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
  return {
    reportType: "file-storage-archive-restore-drill",
    generatedAt: new Date().toISOString(),
    assumptions: {
      archiveRestoreDrillOnly: true,
      restoreTargetIsIsolated: true,
      noProviderMigrationExecuted: true,
      noMetadataPointersUpdated: true,
      noSourceFilesDeleted: true,
      providerCredentialsRequired: false
    },
    inputs: {
      dbPath: safeRelative(context.root, context.dbPath),
      dbExists: context.dbRows.exists,
      repositoryDir: safeRelative(context.root, context.repositoryDir),
      releasePackageDir: safeRelative(context.root, context.releasePackageRoot),
      restoreTargetDir: safeRelative(context.root, restoreTargetDir),
      limit
    },
    summary: {
      totalMetadataObjects: context.metadataObjects.length,
      restoredCount: restored.length,
      restoredBytes,
      hashVerifiedCount: restored.filter((item) => item.hashVerified).length,
      blockedCount: blocked.length,
      skippedCount: skipped.length
    },
    restored,
    blocked,
    skipped
  };
}

export async function writeStorageArchiveRestoreDrill(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-archive-restore-drill.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-archive-restore-drill.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    restoreTargetDir: "",
    limit: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--restore-target") parsed.restoreTargetDir = argv[++index] ?? "";
    else if (arg === "--limit") parsed.limit = parsePositiveInt(argv[++index], DEFAULT_LIMIT);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageArchiveRestoreDrill({
    outputDir: args.outputDir || undefined,
    restoreTargetDir: args.restoreTargetDir || undefined,
    limit: args.limit
  });
  if (args.outputDir) {
    await writeStorageArchiveRestoreDrill(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
