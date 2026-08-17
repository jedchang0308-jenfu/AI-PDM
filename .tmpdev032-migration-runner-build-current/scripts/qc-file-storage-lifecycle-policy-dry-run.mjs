#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildStorageLifecyclePolicyDryRun,
  writeStorageLifecyclePolicyDryRun
} from "./generate-file-storage-lifecycle-policy-dry-run.mjs";
import { sha256Bytes } from "./qc-file-hash-utils.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];
let tempRoot;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function writeFixtureDb(dbPath, files) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE submissions (
        id TEXT PRIMARY KEY,
        drawing_number TEXT,
        revision TEXT,
        status TEXT
      );
      CREATE TABLE submission_files (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        file_role TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT
      );
      CREATE TABLE release_packages (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        package_filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT
      );
      CREATE TABLE file_assets (
        id TEXT PRIMARY KEY,
        storage_provider TEXT NOT NULL,
        original_path TEXT,
        storage_key TEXT,
        file_name TEXT NOT NULL,
        file_ext TEXT,
        mime_type TEXT,
        file_size INTEGER,
        content_hash TEXT,
        hash_algorithm TEXT,
        linked_entity_type TEXT,
        linked_entity_id TEXT,
        document_category TEXT,
        revision TEXT,
        sync_status TEXT,
        deleted_at TEXT,
        created_at TEXT
      );
    `);

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-draft", "DRW-QC-DRAFT", "A", "Draft");
    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-released", "DRW-QC-REL", "A", "Released");
    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-pending", "DRW-QC-PEND", "A", "Pending");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("draft-old", "sub-draft", "pdf", "draft-old.pdf", files.draftPath, files.draftHash, 8, "2026-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("released-official", "sub-released", "pdf", "released.pdf", files.releasedPath, files.releasedHash, 10, "2025-01-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("pending-large", "sub-pending", "step", "large.step", files.largePath, files.largeHash, 4096, "2026-05-20T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("missing-file", "sub-pending", "pdf", "missing.pdf", files.missingPath, "missing-hash", 7, "2026-04-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("hash-mismatch", "sub-pending", "pdf", "mismatch.pdf", files.mismatchPath, "wrong-hash", 9, "2026-04-02T00:00:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-released", "sub-released", "release.zip", files.releasePath, files.releaseHash, 12, "2025-02-01T00:00:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-deleted",
      "local_repository",
      files.assetPath,
      "assets/deleted.step",
      "deleted.step",
      ".step",
      "application/step",
      11,
      files.assetHash,
      "SHA-256",
      "part_number",
      "PN-001",
      "cad",
      "A",
      "synced",
      "2025-03-01T00:00:00.000Z",
      "2025-01-15T00:00:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-lifecycle-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
  const outputDir = path.join(tempRoot, "lifecycle-output");
  await fsp.mkdir(path.join(repositoryDir, "pending"), { recursive: true });
  await fsp.mkdir(releaseDir, { recursive: true });

  const draftBytes = Buffer.alloc(8, "d");
  const releasedBytes = Buffer.alloc(10, "r");
  const largeBytes = Buffer.alloc(20, "l");
  const mismatchBytes = Buffer.alloc(9, "m");
  const releaseBytes = Buffer.alloc(12, "p");
  const assetBytes = Buffer.alloc(11, "a");
  const files = {
    draftPath: path.join(repositoryDir, "pending", "draft-old.pdf"),
    releasedPath: path.join(repositoryDir, "pending", "released.pdf"),
    largePath: path.join(repositoryDir, "pending", "large.step"),
    missingPath: path.join(repositoryDir, "pending", "missing.pdf"),
    mismatchPath: path.join(repositoryDir, "pending", "mismatch.pdf"),
    releasePath: path.join(releaseDir, "release.zip"),
    assetPath: path.join(repositoryDir, "assets", "deleted.step"),
    draftHash: sha256Bytes(draftBytes),
    releasedHash: sha256Bytes(releasedBytes),
    largeHash: sha256Bytes(largeBytes),
    releaseHash: sha256Bytes(releaseBytes),
    assetHash: sha256Bytes(assetBytes)
  };
  await fsp.mkdir(path.dirname(files.assetPath), { recursive: true });
  await fsp.writeFile(files.draftPath, draftBytes);
  await fsp.writeFile(files.releasedPath, releasedBytes);
  await fsp.writeFile(files.largePath, largeBytes);
  await fsp.writeFile(files.mismatchPath, mismatchBytes);
  await fsp.writeFile(files.releasePath, releaseBytes);
  await fsp.writeFile(files.assetPath, assetBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = await buildStorageLifecyclePolicyDryRun({
    root: tempRoot,
    now: "2026-06-11T00:00:00.000Z",
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_STORAGE_DRAFT_RETENTION_DAYS: "30",
      PDM_STORAGE_WARM_AFTER_DAYS: "60",
      PDM_STORAGE_COLD_AFTER_DAYS: "120",
      PDM_STORAGE_MAX_UPLOAD_MB: "0.000001",
      PDM_STORAGE_WARN_PCT: "1",
      PDM_STORAGE_CRITICAL_PCT: "2",
      PDM_STORAGE_INCLUDED_GB: "0.000001"
    }
  });
  const outputs = await writeStorageLifecyclePolicyDryRun(report, outputDir);

  record("STORAGE-LIFECYCLE-001 report type is stable", report.reportType === "file-storage-lifecycle-policy-dry-run");
  record("STORAGE-LIFECYCLE-002 dry-run guardrails are explicit", report.assumptions.dryRunOnly === true && report.assumptions.noFilesDeleted === true);
  record("STORAGE-LIFECYCLE-003 metadata pointers are not updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-LIFECYCLE-004 released files are protected", report.assumptions.releasedFilesProtected === true && report.summary.releasedProtectedCount === 2);
  record("STORAGE-LIFECYCLE-005 stale draft is flagged for review", report.summary.staleDraftReviewCount >= 1 && report.objects.some((item) => item.id === "draft-old" && item.actions.includes("review_stale_draft_retention")));
  record("STORAGE-LIFECYCLE-006 cold archive candidate is identified", report.summary.coldArchiveCandidateCount >= 1 && report.objects.some((item) => item.id === "asset-deleted" && item.actions.includes("review_cold_archive_candidate")));
  record("STORAGE-LIFECYCLE-007 upload limit warnings are produced", report.summary.uploadLimitWarningCount >= 1 && report.objects.some((item) => item.id === "pending-large" && item.overUploadLimit));
  record("STORAGE-LIFECYCLE-008 missing and mismatch objects block cleanup", ["source_file_missing", "sha256_mismatch"].every((reason) => report.blockers.some((item) => item.reason === reason)));
  record("STORAGE-LIFECYCLE-009 action summary includes retain released", report.actionSummary.retain_released_official?.count === 2);
  record("STORAGE-LIFECYCLE-010 storage threshold status is calculated", report.summary.storageThresholdStatus === "critical");
  record("STORAGE-LIFECYCLE-011 recommendations protect released files", report.recommendations.some((item) => /released official files/i.test(item)));
  record("STORAGE-LIFECYCLE-012 recommendations block cleanup on audit failure", report.recommendations.some((item) => /Resolve missing objects/i.test(item)));
  record("STORAGE-LIFECYCLE-013 JSON output is written", await exists(outputs.jsonPath));
  record("STORAGE-LIFECYCLE-014 Markdown output is written", await exists(outputs.markdownPath));

  const serialized = JSON.stringify(report);
  record("STORAGE-LIFECYCLE-015 report does not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized));

  const packageJson = readProjectFile(root, "package.json");
  record("STORAGE-LIFECYCLE-016 package scripts are registered", packageJson.includes('"storage:lifecycle-policy-dry-run"') && packageJson.includes('"qc:file-storage-lifecycle-policy"'));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
  });
