#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { buildStorageCostReport } from "./generate-file-storage-cost-report.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
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

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run(
      "sub-1",
      "DRW-001",
      "A",
      "Pending"
    );
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-1", "sub-1", "pdf", "same-a.pdf", files.sameA, files.sameHash, 10, "2026-06-10T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-2", "sub-1", "pdf", "same-b.pdf", files.sameB, files.sameHash, 10, "2026-06-10T00:01:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-2b", "sub-1", "pdf", "same-a-reference.pdf", files.sameA, files.sameHash, 10, "2026-06-10T00:01:15.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-3", "sub-1", "pdf", "mismatch.pdf", files.mismatch, "expected-but-wrong", 5, "2026-06-10T00:01:30.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-4", "sub-1", "pdf", "missing.pdf", files.missing, "hash-missing", 7, "2026-06-10T00:01:45.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-1", "sub-1", "release.zip", files.releaseZip, files.releaseHash, 30, "2026-06-10T00:02:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-1",
      "supabase_storage",
      null,
      "pdm-hot/asset-1.step",
      "asset-1.step",
      ".step",
      "application/step",
      40,
      "hash-asset",
      "SHA-256",
      "part_number",
      "PN-001",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-10T00:03:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(repositoryDir, { recursive: true });

  const files = {
    sameA: path.join(repositoryDir, "pending", "same-a.pdf"),
    sameB: path.join(repositoryDir, "pending", "same-b.pdf"),
    mismatch: path.join(repositoryDir, "pending", "mismatch.pdf"),
    missing: path.join(repositoryDir, "pending", "missing.pdf"),
    orphan: path.join(repositoryDir, "pending", "orphan.bin"),
    releaseZip: path.join(dataDir, "release-packages", "2026", "06", "release.zip")
  };
  const sameBytes = Buffer.alloc(10, "a");
  const mismatchBytes = Buffer.alloc(5, "m");
  const releaseBytes = Buffer.alloc(30, "z");
  files.sameHash = sha256(sameBytes);
  files.releaseHash = sha256(releaseBytes);

  await fsp.mkdir(path.dirname(files.sameA), { recursive: true });
  await fsp.mkdir(path.dirname(files.releaseZip), { recursive: true });
  await fsp.writeFile(files.sameA, sameBytes);
  await fsp.writeFile(files.sameB, sameBytes);
  await fsp.writeFile(files.mismatch, mismatchBytes);
  await fsp.writeFile(files.orphan, Buffer.alloc(11, "o"));
  await fsp.writeFile(files.releaseZip, releaseBytes);

  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = await buildStorageCostReport({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_STORAGE_INCLUDED_GB: "100",
      PDM_EGRESS_INCLUDED_GB: "250"
    },
    limit: 10
  });

  record("STORAGE-COST-001 report type is stable", report.reportType === "file-storage-cost-inventory");
  record("STORAGE-COST-002 fixture database detected", report.inputs.dbExists === true);
  record("STORAGE-COST-003 repository scan counts files", report.repositoryScan.files === 4, String(report.repositoryScan.files));
  record("STORAGE-COST-004 metadata includes all provider rows", report.metadata.count === 7, String(report.metadata.count));
  record("STORAGE-COST-005 local provider byte total is correct", report.metadata.byProvider.local_repository.bytes === 72);
  record("STORAGE-COST-006 supabase provider byte total is correct", report.metadata.byProvider.supabase_storage.bytes === 40);
  record("STORAGE-COST-007 duplicate hash group is reported", report.metadata.duplicateGroups.length === 1);
  record("STORAGE-COST-008 duplicate recoverable bytes are estimated", report.metadata.duplicateRecoverableBytes === 10);
  record(
    "STORAGE-COST-008A duplicate recoverable bytes ignore already shared physical paths",
    report.metadata.duplicateGroups[0]?.businessReferenceCount === 3 && report.metadata.duplicateGroups[0]?.physicalObjectCount === 2
  );
  record("STORAGE-COST-009 missing local objects are reported", report.localObjectAudit.missingLocalObjectCount === 1);
  record("STORAGE-COST-010 no provider migration is executed", report.assumptions.noProviderMigrationExecuted === true);
  record("STORAGE-COST-011 no files are deleted", report.assumptions.noFilesDeleted === true);
  record("STORAGE-COST-012 metadata lifecycle summary exists", report.metadata.byLifecycleTier.hot.bytes === 112);
  record(
    "STORAGE-COST-013 release packages use release package root keys",
    report.metadata.topLargeObjects.some((object) => object.source === "release_packages" && object.storageKey === "2026/06/release.zip")
  );
  record("STORAGE-COST-014 hash mismatch objects are reported", report.localObjectAudit.hashMismatchCount === 1);
  record("STORAGE-COST-015 orphan local files are reported", report.localObjectAudit.orphanLocalFileCount === 1);
  record("STORAGE-COST-016 local object audit scans repository and release package roots", report.localObjectAudit.scannedRoots.length === 2);
  record("STORAGE-COST-017 threshold usage includes all scanned local roots", typeof report.thresholdUsage.scannedLocalRootsIncludedPct === "number");

  const serialized = JSON.stringify(report);
  record("STORAGE-COST-018 report does not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY)/i.test(serialized));

  await fsp.rm(tempRoot, { recursive: true, force: true });

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
