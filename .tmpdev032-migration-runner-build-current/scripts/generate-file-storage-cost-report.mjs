#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getDataDir, getRepositoryDir } from "./pdm-paths.mjs";
import { normalizeExtension, normalizeStorageMetadataRows, safeRelative } from "./storage-metadata-normalizer.mjs";

const DEFAULT_TOP_LIMIT = 20;

function bytesToGb(bytes) {
  return bytes / 1024 / 1024 / 1024;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createEmptySummary() {
  return {
    count: 0,
    bytes: 0,
    gb: 0
  };
}

function addToSummary(summary, bytes) {
  summary.count += 1;
  summary.bytes += bytes;
  summary.gb = Number(bytesToGb(summary.bytes).toFixed(6));
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function tableColumns(db, tableName) {
  if (!tableExists(db, tableName)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function selectColumn(columns, alias, columnName, fallbackSql) {
  return columns.has(columnName)
    ? `${alias}.${columnName} AS ${columnName}`
    : `${fallbackSql} AS ${columnName}`;
}

function readRows(db, tableName, sql) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(sql).all();
}

function readDatabaseRows(dbPath) {
  if (!existsSync(dbPath)) {
    return {
      exists: false,
      submissionFiles: [],
      releasePackages: [],
      fileAssets: []
    };
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const submissionFileColumns = tableColumns(db, "submission_files");
    const releasePackageColumns = tableColumns(db, "release_packages");
    const submissionFiles = readRows(
      db,
      "submission_files",
      `SELECT
        f.id,
        f.submission_id,
        f.file_role,
        f.original_filename,
        f.local_path,
        ${selectColumn(submissionFileColumns, "f", "storage_provider", "'local_repository'")},
        ${selectColumn(submissionFileColumns, "f", "storage_bucket", "NULL")},
        ${selectColumn(submissionFileColumns, "f", "storage_key", "NULL")},
        f.sha256,
        f.file_size,
        f.created_at,
        s.status AS submission_status,
        s.drawing_number,
        s.revision
      FROM submission_files f
      LEFT JOIN submissions s ON s.id = f.submission_id
      ORDER BY f.created_at ASC, f.id ASC`
    );

    const releasePackages = readRows(
      db,
      "release_packages",
      `SELECT
        id,
        submission_id,
        package_filename,
        local_path,
        ${selectColumn(releasePackageColumns, "release_packages", "storage_provider", "'local_repository'")},
        ${selectColumn(releasePackageColumns, "release_packages", "storage_bucket", "NULL")},
        ${selectColumn(releasePackageColumns, "release_packages", "storage_key", "NULL")},
        sha256,
        file_size,
        created_at
      FROM release_packages
      ORDER BY created_at ASC, id ASC`
    );

    const fileAssets = readRows(
      db,
      "file_assets",
      `SELECT
        id,
        storage_provider,
        original_path,
        storage_key,
        file_name,
        file_ext,
        mime_type,
        file_size,
        content_hash,
        hash_algorithm,
        linked_entity_type,
        linked_entity_id,
        document_category,
        revision,
        sync_status,
        deleted_at,
        created_at
      FROM file_assets
      ORDER BY created_at ASC, id ASC`
    );

    return {
      exists: true,
      submissionFiles,
      releasePackages,
      fileAssets
    };
  } finally {
    db.close();
  }
}

async function scanDirectory(rootDir, root, limit) {
  const summary = {
    exists: existsSync(rootDir),
    root: safeRelative(root, rootDir),
    files: 0,
    bytes: 0,
    gb: 0,
    byExtension: {},
    topLargeFiles: []
  };

  if (!summary.exists) return summary;

  const top = [];
  const filesForAudit = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const fileStat = await stat(fullPath);
      const extension = normalizeExtension(entry.name);
      summary.files += 1;
      summary.bytes += fileStat.size;
      summary.byExtension[extension] ??= createEmptySummary();
      addToSummary(summary.byExtension[extension], fileStat.size);
      top.push({
        path: safeRelative(rootDir, fullPath),
        bytes: fileStat.size,
        extension
      });
      filesForAudit.push({
        path: safeRelative(rootDir, fullPath),
        absolutePath: path.resolve(fullPath),
        bytes: fileStat.size,
        extension
      });
    }
  }

  await visit(rootDir);
  summary.gb = Number(bytesToGb(summary.bytes).toFixed(6));
  summary.topLargeFiles = top.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
  Object.defineProperty(summary, "filesForAudit", {
    value: filesForAudit,
    enumerable: false
  });
  return summary;
}

function summarizeMetadata(objects, limit, repositoryDir) {
  const byProvider = {};
  const bySource = {};
  const byExtension = {};
  const byBusinessStatus = {};
  const byLifecycleTier = {};
  const missingLocalObjects = [];
  const duplicateGroups = new Map();

  for (const object of objects) {
    const bytes = Number(object.bytes || 0);
    byProvider[object.provider] ??= createEmptySummary();
    bySource[object.source] ??= createEmptySummary();
    byExtension[object.extension] ??= createEmptySummary();
    byBusinessStatus[object.businessStatus] ??= createEmptySummary();
    byLifecycleTier[object.lifecycleTier ?? "unknown"] ??= createEmptySummary();
    addToSummary(byProvider[object.provider], bytes);
    addToSummary(bySource[object.source], bytes);
    addToSummary(byExtension[object.extension], bytes);
    addToSummary(byBusinessStatus[object.businessStatus], bytes);
    addToSummary(byLifecycleTier[object.lifecycleTier ?? "unknown"], bytes);

    if (object.hash) {
      const group = duplicateGroups.get(object.hash) ?? [];
      group.push(object);
      duplicateGroups.set(object.hash, group);
    }

    if (object.provider === "local_repository" && object.pathForExistenceCheck) {
      const resolved = path.resolve(object.pathForExistenceCheck);
      const localRoot = path.resolve(object.localRoot ?? repositoryDir);
      const insideRoot = resolved === localRoot || resolved.startsWith(localRoot + path.sep);
      if (!insideRoot || !existsSync(resolved)) {
        missingLocalObjects.push({
          id: object.id,
          source: object.source,
          filename: object.filename,
          storageKey: object.storageKey,
          reason: insideRoot ? "missing" : "outside_local_root"
        });
      }
    }
  }

  const duplicates = [];
  for (const [hash, group] of duplicateGroups.entries()) {
    const physicalObjects = uniquePhysicalObjects(group);
    if (physicalObjects.length < 2) continue;
    const totalBytes = physicalObjects.reduce((sum, object) => sum + Number(object.bytes || 0), 0);
    const largestBytes = Math.max(...physicalObjects.map((object) => Number(object.bytes || 0)));
    duplicates.push({
      hash,
      count: physicalObjects.length,
      physicalObjectCount: physicalObjects.length,
      businessReferenceCount: group.length,
      totalBytes,
      estimatedRecoverableBytes: Math.max(0, totalBytes - largestBytes),
      members: group.slice(0, limit).map((object) => ({
        id: object.id,
        source: object.source,
        provider: object.provider,
        filename: object.filename,
        bytes: object.bytes,
        storageKey: object.storageKey
      }))
    });
  }

  const topLargeObjects = [...objects]
    .sort((a, b) => Number(b.bytes || 0) - Number(a.bytes || 0))
    .slice(0, limit)
    .map((object) => ({
      id: object.id,
      source: object.source,
      provider: object.provider,
      filename: object.filename,
      extension: object.extension,
      bytes: object.bytes,
      storageKey: object.storageKey
    }));

  const totalBytes = objects.reduce((sum, object) => sum + Number(object.bytes || 0), 0);
  const duplicateRecoverableBytes = duplicates.reduce((sum, group) => sum + group.estimatedRecoverableBytes, 0);

  return {
    count: objects.length,
    bytes: totalBytes,
    gb: Number(bytesToGb(totalBytes).toFixed(6)),
    byProvider,
    bySource,
    byExtension,
    byBusinessStatus,
    byLifecycleTier,
    duplicateGroups: duplicates.sort((a, b) => b.estimatedRecoverableBytes - a.estimatedRecoverableBytes).slice(0, limit),
    duplicateRecoverableBytes,
    duplicateRecoverableGb: Number(bytesToGb(duplicateRecoverableBytes).toFixed(6)),
    missingLocalObjects: missingLocalObjects.slice(0, limit),
    missingLocalObjectCount: missingLocalObjects.length,
    topLargeObjects
  };
}

function uniquePhysicalObjects(group) {
  const unique = new Map();
  for (const object of group) {
    const physicalKey = [object.provider, object.bucket ?? "", object.storageKey ?? object.pathForExistenceCheck ?? object.id].join(":");
    if (!unique.has(physicalKey)) unique.set(physicalKey, object);
  }
  return [...unique.values()];
}

async function buildLocalObjectAudit(objects, scans, limit) {
  const referencedPaths = new Set();
  const missingLocalObjects = [];
  const hashMismatchObjects = [];

  for (const object of objects) {
    if (object.provider !== "local_repository" || !object.pathForExistenceCheck) continue;
    const localRoot = path.resolve(object.localRoot);
    const resolved = path.resolve(object.pathForExistenceCheck);
    const insideRoot = resolved === localRoot || resolved.startsWith(localRoot + path.sep);
    if (!insideRoot || !existsSync(resolved)) {
      missingLocalObjects.push({
        id: object.id,
        source: object.source,
        filename: object.filename,
        storageKey: object.storageKey,
        reason: insideRoot ? "missing" : "outside_local_root"
      });
      continue;
    }

    referencedPaths.add(resolved.toLowerCase());
    if (object.hash) {
      const actualHash = await hashFile(resolved);
      if (actualHash !== object.hash) {
        hashMismatchObjects.push({
          id: object.id,
          source: object.source,
          filename: object.filename,
          storageKey: object.storageKey,
          expectedSha256: object.hash,
          actualSha256: actualHash
        });
      }
    }
  }

  const orphanLocalFiles = [];
  for (const scan of scans) {
    for (const file of scan.filesForAudit) {
      if (referencedPaths.has(file.absolutePath.toLowerCase())) continue;
      orphanLocalFiles.push({
        root: scan.name,
        path: file.path,
        bytes: file.bytes,
        extension: file.extension
      });
    }
  }

  return {
    scannedRoots: scans.map((scan) => ({
      name: scan.name,
      root: scan.summary.root,
      exists: scan.summary.exists,
      files: scan.summary.files,
      bytes: scan.summary.bytes,
      gb: scan.summary.gb
    })),
    missingLocalObjects: missingLocalObjects.slice(0, limit),
    missingLocalObjectCount: missingLocalObjects.length,
    hashMismatchObjects: hashMismatchObjects.slice(0, limit),
    hashMismatchCount: hashMismatchObjects.length,
    orphanLocalFiles: orphanLocalFiles.sort((a, b) => b.bytes - a.bytes).slice(0, limit),
    orphanLocalFileCount: orphanLocalFiles.length
  };
}

async function hashFile(filePath) {
  return crypto.createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export function buildStorageMetadataContext(options = {}) {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const dataDir = getDataDir(root, env);
  const repositoryDir = getRepositoryDir(root, env);
  const releasePackageRoot = path.join(dataDir, "release-packages");
  const dbPath = path.join(dataDir, "ai-pdm.sqlite");
  const dbRows = readDatabaseRows(dbPath);
  const metadataObjects = normalizeStorageMetadataRows(dbRows, { repositoryDir, releasePackageRoot, root });
  return {
    root,
    dataDir,
    repositoryDir,
    releasePackageRoot,
    dbPath,
    dbRows,
    metadataObjects
  };
}

export async function buildStorageCostReport(options = {}) {
  const env = options.env ?? process.env;
  const limit = options.limit ?? parsePositiveInt(env.PDM_STORAGE_REPORT_TOP_LIMIT, DEFAULT_TOP_LIMIT);
  const storageIncludedGb = parsePositiveNumber(env.PDM_STORAGE_INCLUDED_GB, 100);
  const egressIncludedGb = parsePositiveNumber(env.PDM_EGRESS_INCLUDED_GB, 250);
  const { root, repositoryDir, releasePackageRoot, dbPath, dbRows, metadataObjects } = buildStorageMetadataContext(options);
  const metadata = summarizeMetadata(metadataObjects, limit, repositoryDir);
  const repositoryScan = await scanDirectory(repositoryDir, root, limit);
  const releasePackageScan = await scanDirectory(releasePackageRoot, root, limit);
  const scannedLocalRootsGb = Number(bytesToGb(repositoryScan.bytes + releasePackageScan.bytes).toFixed(6));
  const localObjectAudit = await buildLocalObjectAudit(
    metadataObjects,
    [
      { name: "repository", summary: repositoryScan, filesForAudit: repositoryScan.filesForAudit ?? [] },
      { name: "release_packages", summary: releasePackageScan, filesForAudit: releasePackageScan.filesForAudit ?? [] }
    ],
    limit
  );

  return {
    reportType: "file-storage-cost-inventory",
    generatedAt: new Date().toISOString(),
    root: safeRelative(root, root),
    inputs: {
      dbPath: safeRelative(root, dbPath),
      dbExists: dbRows.exists,
      repositoryDir: safeRelative(root, repositoryDir),
      repositoryExists: repositoryScan.exists,
      releasePackageDir: safeRelative(root, releasePackageRoot),
      releasePackageDirExists: releasePackageScan.exists
    },
    assumptions: {
      pricingReferenceDate: "2026-06-10",
      storageIncludedGb,
      egressIncludedGb,
      pricingMustBeRecheckedBeforePurchase: true,
      noProviderMigrationExecuted: true,
      noFilesDeleted: true
    },
    metadata,
    repositoryScan,
    releasePackageScan,
    localObjectAudit,
    thresholdUsage: {
      metadataStorageIncludedPct: storageIncludedGb > 0 ? Number(((metadata.gb / storageIncludedGb) * 100).toFixed(3)) : null,
      scannedRepositoryIncludedPct:
        storageIncludedGb > 0 ? Number(((repositoryScan.gb / storageIncludedGb) * 100).toFixed(3)) : null,
      scannedLocalRootsIncludedPct: storageIncludedGb > 0 ? Number(((scannedLocalRootsGb / storageIncludedGb) * 100).toFixed(3)) : null
    },
    recommendations: buildRecommendations(metadata, repositoryScan, storageIncludedGb, localObjectAudit)
  };
}

function buildRecommendations(metadata, repositoryScan, storageIncludedGb, localObjectAudit) {
  const recommendations = [];
  if (!metadata.count && !repositoryScan.files) {
    recommendations.push("No file inventory found. Keep Storage follow-up in Backlog until real PDM uploads exist.");
  }
  if (metadata.duplicateRecoverableBytes > 0) {
    recommendations.push("Implement SHA-256 deduplication before migrating large historical file sets.");
  }
  if (metadata.missingLocalObjectCount > 0) {
    recommendations.push("Resolve missing or out-of-repository local objects before provider migration.");
  }
  if (localObjectAudit.hashMismatchCount > 0) {
    recommendations.push("Block provider migration until local hash mismatches are resolved.");
  }
  if (localObjectAudit.orphanLocalFileCount > 0) {
    recommendations.push("Review orphan local files before lifecycle cleanup or provider migration.");
  }
  if (storageIncludedGb > 0 && (metadata.gb > storageIncludedGb * 0.7 || repositoryScan.gb > storageIncludedGb * 0.7)) {
    recommendations.push("Storage usage is above 70% of the configured included quota; prioritize lifecycle and provider abstraction.");
  }
  if (metadata.topLargeObjects.some((object) => object.bytes >= 500 * 1024 * 1024)) {
    recommendations.push("Large-file workflow is required for objects above 500 MB.");
  }
  if (!recommendations.length) {
    recommendations.push("Proceed with FileStorageService abstraction before Google Cloud Storage cutover.");
  }
  return recommendations;
}

async function main() {
  const report = await buildStorageCostReport();
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
