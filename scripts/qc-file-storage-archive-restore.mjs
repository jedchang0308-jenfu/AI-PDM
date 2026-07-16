#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildStorageArchiveRestoreDrill,
  writeStorageArchiveRestoreDrill
} from "./generate-file-storage-archive-restore-drill.mjs";
import { sha256Bytes, sha256File } from "./qc-file-hash-utils.mjs";

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

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-restore", "DRW-RESTORE-001", "A", "Released");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-restore-ok", "sub-restore", "pdf", "restore-ok.pdf", files.okPath, files.okHash, 9, "2026-06-11T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-restore-missing", "sub-restore", "dwg", "missing.dwg", files.missingPath, "missing-hash", 11, "2026-06-11T00:01:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-restore-mismatch", "sub-restore", "pdf", "mismatch.pdf", files.mismatchPath, "wrong-hash", 7, "2026-06-11T00:02:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-restore-ok", "sub-restore", "release-restore.zip", files.releasePath, files.releaseHash, 13, "2026-06-11T00:03:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-restore-skipped",
      "supabase_storage",
      null,
      "pdm-hot/already-remote.step",
      "already-remote.step",
      ".step",
      "application/step",
      21,
      "remote-hash",
      "SHA-256",
      "part_number",
      "PN-RESTORE",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-11T00:04:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-restore-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
  const outputDir = path.join(tempRoot, "restore-drill-output");
  const restoreTargetDir = path.join(outputDir, "restore-target");
  await fsp.mkdir(path.join(repositoryDir, "released"), { recursive: true });
  await fsp.mkdir(releaseDir, { recursive: true });

  const okBytes = Buffer.alloc(9, "o");
  const mismatchBytes = Buffer.alloc(7, "m");
  const releaseBytes = Buffer.alloc(13, "r");
  const files = {
    okPath: path.join(repositoryDir, "released", "restore-ok.pdf"),
    missingPath: path.join(repositoryDir, "released", "missing.dwg"),
    mismatchPath: path.join(repositoryDir, "released", "mismatch.pdf"),
    releasePath: path.join(releaseDir, "release-restore.zip"),
    okHash: sha256Bytes(okBytes),
    releaseHash: sha256Bytes(releaseBytes)
  };
  await fsp.writeFile(files.okPath, okBytes);
  await fsp.writeFile(files.mismatchPath, mismatchBytes);
  await fsp.writeFile(files.releasePath, releaseBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = await buildStorageArchiveRestoreDrill({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir
    },
    outputDir,
    restoreTargetDir,
    limit: 10
  });
  const written = await writeStorageArchiveRestoreDrill(report, outputDir);
  const markdown = await fsp.readFile(written.markdownPath, "utf8");

  record("STORAGE-ARCHIVE-RESTORE-001 report type is stable", report.reportType === "file-storage-archive-restore-drill");
  record("STORAGE-ARCHIVE-RESTORE-002 restore guardrails are explicit", report.assumptions.archiveRestoreDrillOnly === true && report.assumptions.restoreTargetIsIsolated === true);
  record("STORAGE-ARCHIVE-RESTORE-003 no provider migration is executed", report.assumptions.noProviderMigrationExecuted === true);
  record("STORAGE-ARCHIVE-RESTORE-004 no metadata pointers are updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-ARCHIVE-RESTORE-005 source files are not deleted", report.assumptions.noSourceFilesDeleted === true && fs.existsSync(files.okPath) && fs.existsSync(files.releasePath));
  record("STORAGE-ARCHIVE-RESTORE-006 provider credentials are not required", report.assumptions.providerCredentialsRequired === false);
  record("STORAGE-ARCHIVE-RESTORE-007 valid local and release package objects restore", report.summary.restoredCount === 2, String(report.summary.restoredCount));
  record("STORAGE-ARCHIVE-RESTORE-008 restored objects are hash verified", report.summary.hashVerifiedCount === 2 && report.restored.every((item) => item.hashVerified));
  record("STORAGE-ARCHIVE-RESTORE-009 missing and mismatch objects are blocked", report.summary.blockedCount === 2 && ["source_file_missing", "sha256_mismatch"].every((reason) => report.blocked.some((item) => item.reason === reason)));
  record("STORAGE-ARCHIVE-RESTORE-010 remote provider object is skipped", report.summary.skippedCount === 1 && report.skipped[0]?.reason === "source_provider_not_local_repository");
  record("STORAGE-ARCHIVE-RESTORE-011 restored files exist under isolated target", report.restored.every((item) => fs.existsSync(path.join(tempRoot, item.restorePath))));
  record(
    "STORAGE-ARCHIVE-RESTORE-012 restored file hashes match source metadata",
    (await Promise.all(report.restored.map(async (item) => sha256File(path.join(tempRoot, item.restorePath))))).every((hash, index) => hash === report.restored[index].expectedSha256)
  );
  record("STORAGE-ARCHIVE-RESTORE-013 output JSON and Markdown are written", fs.existsSync(written.jsonPath) && fs.existsSync(written.markdownPath) && markdown.includes("AI_PDM Storage Archive Restore Drill"));

  const serialized = JSON.stringify(report);
  record("STORAGE-ARCHIVE-RESTORE-014 report does not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY)/i.test(serialized));

  const packageJson = await fsp.readFile(path.join(root, "package.json"), "utf8");
  record("STORAGE-ARCHIVE-RESTORE-015 package scripts are registered", packageJson.includes('"storage:archive-restore-drill"') && packageJson.includes('"qc:file-storage-archive-restore"'));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
  });
