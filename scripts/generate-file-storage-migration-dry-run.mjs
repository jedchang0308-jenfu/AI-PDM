#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildStorageMetadataContext } from "./generate-file-storage-cost-report.mjs";

const DEFAULT_TARGET_PROVIDER = "google_cloud_storage";
const DEFAULT_TARGET_BUCKET = "pdm-primary";
const DEFAULT_TARGET_PREFIX = "ai-pdm";

function sha256FileSync(filePath) {
  return crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sanitizeKeyPart(value) {
  return String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.\./g, "_")
    .trim();
}

function buildTargetKey(object, targetPrefix) {
  const parts = [
    targetPrefix,
    object.source,
    object.linkedEntityType ?? "unlinked",
    object.linkedEntityId ?? "unknown",
    object.hash ?? object.id,
    object.filename
  ];
  return parts.map(sanitizeKeyPart).filter(Boolean).join("/");
}

function buildPointerPreview(object, targetProvider, targetBucket, targetKey) {
  if (object.source === "submission_files") {
    return {
      table: "submission_files",
      id: object.id,
      currentLocalPath: object.localPath,
      proposedStorageProvider: targetProvider,
      proposedStorageBucket: targetBucket,
      proposedStorageKey: targetKey,
      note: "Requires future schema before pointer can be persisted."
    };
  }
  if (object.source === "release_packages") {
    return {
      table: "release_packages",
      id: object.id,
      currentLocalPath: object.localPath,
      proposedStorageProvider: targetProvider,
      proposedStorageBucket: targetBucket,
      proposedStorageKey: targetKey,
      note: "Requires future schema before pointer can be persisted."
    };
  }
  return {
    table: "file_assets",
    id: object.id,
    currentStorageProvider: object.provider,
    currentStorageKey: object.storageKey,
    proposedStorageProvider: targetProvider,
    proposedStorageBucket: targetBucket,
    proposedStorageKey: targetKey
  };
}

function buildBusinessLinkInvariant(object) {
  const storagePointerFieldsBySource = {
    submission_files: ["storage_provider", "storage_bucket", "storage_key", "local_path"],
    release_packages: ["storage_provider", "storage_bucket", "storage_key", "local_path"],
    file_assets: ["storage_provider", "storage_key", "original_path"]
  };

  return {
    invariant: "storage_pointer_update_only",
    source: object.source,
    id: object.id,
    linkedEntityType: object.linkedEntityType ?? null,
    linkedEntityId: object.linkedEntityId ?? null,
    preservedBusinessKeys: {
      source: object.source,
      id: object.id,
      linkedEntityType: object.linkedEntityType ?? null,
      linkedEntityId: object.linkedEntityId ?? null,
      filename: object.filename,
      sha256: object.hash
    },
    allowedPointerFields: storagePointerFieldsBySource[object.source] ?? ["storage_provider", "storage_key"],
    untouchedRelationshipTables: [
      "submissions",
      "items",
      "drawing_numbers",
      "part_numbers",
      "drawing_part_links"
    ],
    note: "Provider migration must not rewrite submission, drawing, or part relationship identifiers."
  };
}

export function buildStorageMigrationDryRun(options = {}) {
  const env = options.env ?? process.env;
  const targetProvider = options.targetProvider ?? env.PDM_STORAGE_DRY_RUN_TARGET_PROVIDER ?? DEFAULT_TARGET_PROVIDER;
  if (targetProvider === "supabase_storage") throw new Error("SUPABASE_STORAGE_RETIRED_USE_GCS:migration_dry_run");
  const targetBucket = options.targetBucket ?? env.PDM_STORAGE_DRY_RUN_TARGET_BUCKET ?? DEFAULT_TARGET_BUCKET;
  const targetPrefix = options.targetPrefix ?? env.PDM_STORAGE_DRY_RUN_TARGET_PREFIX ?? DEFAULT_TARGET_PREFIX;
  const context = buildStorageMetadataContext(options);
  const planned = [];
  const blocked = [];
  const skipped = [];

  for (const object of context.metadataObjects) {
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
    const insideRoot = sourcePath === localRoot || sourcePath.startsWith(localRoot + path.sep);
    if (!insideRoot) {
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

    const actualHash = sha256FileSync(sourcePath);
    if (actualHash !== object.hash) {
      blocked.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        reason: "sha256_mismatch",
        expectedSha256: object.hash,
        actualSha256: actualHash
      });
      continue;
    }

    const targetKey = buildTargetKey(object, targetPrefix);
    planned.push({
      id: object.id,
      source: object.source,
      filename: object.filename,
      sourceProvider: object.provider,
      sourceKey: object.storageKey,
      sourceLocalPath: object.localPath,
      targetProvider,
      targetBucket,
      targetKey,
      bytes: object.bytes,
      sha256: object.hash,
      lifecycleTier: object.lifecycleTier,
      action: "copy_object_then_update_metadata_pointer_after_hash_verify",
      pointerPreview: buildPointerPreview(object, targetProvider, targetBucket, targetKey),
      businessLinkInvariant: buildBusinessLinkInvariant(object)
    });
  }

  const plannedBytes = planned.reduce((sum, item) => sum + Number(item.bytes || 0), 0);

  return {
    reportType: "file-storage-migration-dry-run",
    generatedAt: new Date().toISOString(),
    assumptions: {
      dryRunOnly: true,
      noProviderMigrationExecuted: true,
      noFilesCopied: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true,
      businessRelationshipTablesUntouched: true,
      targetCredentialsRequired: false
    },
    inputs: {
      dbPath: path.relative(context.root, context.dbPath).split(path.sep).join("/"),
      dbExists: context.dbRows.exists,
      repositoryDir: path.relative(context.root, context.repositoryDir).split(path.sep).join("/"),
      releasePackageDir: path.relative(context.root, context.releasePackageRoot).split(path.sep).join("/")
    },
    target: {
      provider: targetProvider,
      bucket: targetBucket,
      prefix: targetPrefix
    },
    summary: {
      totalMetadataObjects: context.metadataObjects.length,
      plannedCount: planned.length,
      plannedBytes,
      blockedCount: blocked.length,
      skippedCount: skipped.length
    },
    planned,
    blocked,
    skipped
  };
}

async function main() {
  const report = buildStorageMigrationDryRun();
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0) {
    const outPath = process.argv[outIndex + 1];
    if (!outPath) throw new Error("--out requires a path");
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
