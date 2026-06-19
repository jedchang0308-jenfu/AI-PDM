#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import {
  buildS3CompatibleDryRun,
  writeS3CompatibleDryRun
} from "./generate-file-storage-s3-compatible-dry-run.mjs";

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

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-1", "DRW-QC-001", "A", "Pending");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-ok", "sub-1", "pdf", "ok.pdf", files.okPath, files.okHash, 8, "2026-06-10T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-missing", "sub-1", "pdf", "missing.pdf", files.missingPath, "missing-hash", 7, "2026-06-10T00:01:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-mismatch", "sub-1", "pdf", "mismatch.pdf", files.mismatchPath, "wrong-hash", 9, "2026-06-10T00:02:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-ok", "sub-1", "release.zip", files.releasePath, files.releaseHash, 12, "2026-06-10T00:03:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-skipped",
      "supabase_storage",
      null,
      "pdm-hot/already-there.step",
      "already-there.step",
      ".step",
      "application/step",
      22,
      "remote-hash",
      "SHA-256",
      "part_number",
      "PN-001",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-10T00:04:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-s3-dry-run-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
  const outputDir = path.join(tempRoot, "s3-dry-run-output");
  await fsp.mkdir(path.join(repositoryDir, "pending"), { recursive: true });
  await fsp.mkdir(releaseDir, { recursive: true });

  const okBytes = Buffer.alloc(8, "o");
  const mismatchBytes = Buffer.alloc(9, "m");
  const releaseBytes = Buffer.alloc(12, "r");
  const files = {
    okPath: path.join(repositoryDir, "pending", "ok.pdf"),
    missingPath: path.join(repositoryDir, "pending", "missing.pdf"),
    mismatchPath: path.join(repositoryDir, "pending", "mismatch.pdf"),
    releasePath: path.join(releaseDir, "release.zip"),
    okHash: sha256(okBytes),
    releaseHash: sha256(releaseBytes)
  };
  await fsp.writeFile(files.okPath, okBytes);
  await fsp.writeFile(files.mismatchPath, mismatchBytes);
  await fsp.writeFile(files.releasePath, releaseBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = buildS3CompatibleDryRun({
    root: tempRoot,
    profile: "cloudflare_r2",
    bucket: "qc-r2-bucket",
    prefix: "qc",
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir
    }
  });
  const outputs = await writeS3CompatibleDryRun(report, outputDir);

  record("STORAGE-S3-DRY-RUN-001 report type is stable", report.reportType === "file-storage-s3-compatible-dry-run");
  record("STORAGE-S3-DRY-RUN-002 target profile is Cloudflare R2", report.target.profile === "cloudflare_r2" && report.target.label === "Cloudflare R2");
  record("STORAGE-S3-DRY-RUN-003 dry-run guardrails are explicit", report.assumptions.dryRunOnly === true && report.assumptions.noProviderRequests === true);
  record("STORAGE-S3-DRY-RUN-004 no credentials are required for dry-run", report.assumptions.noCredentialsRequired === true);
  record("STORAGE-S3-DRY-RUN-005 metadata pointers are not updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-S3-DRY-RUN-006 valid local objects are planned", report.summary.plannedCount === 2, String(report.summary.plannedCount));
  record("STORAGE-S3-DRY-RUN-007 missing and mismatch objects block readiness", report.summary.blockedCount === 2);
  record("STORAGE-S3-DRY-RUN-008 remote provider object is skipped", report.summary.skippedCount === 1);
  record("STORAGE-S3-DRY-RUN-009 planned target URIs use s3-compatible scheme", report.planned.every((item) => item.targetUri.startsWith("s3-compatible://qc-r2-bucket/qc/")));
  record("STORAGE-S3-DRY-RUN-010 execution env names are documented without values", report.requiredServerEnvForExecution.includes("PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY"));
  record("STORAGE-S3-DRY-RUN-011 pointer rollback plan is retained", report.pointerRollbackPlan.length === report.summary.plannedCount);
  record("STORAGE-S3-DRY-RUN-012 JSON output is written", await exists(outputs.jsonPath));
  record("STORAGE-S3-DRY-RUN-013 Markdown output is written", await exists(outputs.markdownPath));

  const storageSource = await fsp.readFile(path.resolve("src/lib/file-storage.ts"), "utf8");
  record("STORAGE-S3-DRY-RUN-014 file storage provider includes s3_compatible", storageSource.includes('"s3_compatible"'));
  record("STORAGE-S3-DRY-RUN-015 S3 adapter contract exists", storageSource.includes("export class S3CompatibleStorageAdapter implements FileStorageService"));
  record("STORAGE-S3-DRY-RUN-016 S3 live IO is disabled by default", storageSource.includes("PDM_S3_COMPATIBLE_LIVE_ENABLED") && storageSource.includes("signed request staging gate"));
  record("STORAGE-S3-DRY-RUN-017 public S3 credential env is rejected", storageSource.includes("NEXT_PUBLIC_S3_COMPATIBLE_SECRET_ACCESS_KEY") && storageSource.includes("must never be exposed"));

  const serialized = JSON.stringify(report);
  record("STORAGE-S3-DRY-RUN-018 report does not expose common cloud secret markers", !/(secret[^_A-Z]|service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized));

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  record("STORAGE-S3-DRY-RUN-019 package scripts are registered", packageJson.includes('"storage:s3-compatible-dry-run"') && packageJson.includes('"qc:file-storage-s3-compatible-dry-run"'));

  await fsp.rm(tempRoot, { recursive: true, force: true });
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

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
