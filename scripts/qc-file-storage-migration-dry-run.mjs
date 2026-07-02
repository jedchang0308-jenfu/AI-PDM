#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildStorageMigrationDryRun } from "./generate-file-storage-migration-dry-run.mjs";
import { sha256Bytes } from "./qc-file-hash-utils.mjs";

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
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-dry-run-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
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
    okHash: sha256Bytes(okBytes),
    releaseHash: sha256Bytes(releaseBytes)
  };
  await fsp.writeFile(files.okPath, okBytes);
  await fsp.writeFile(files.mismatchPath, mismatchBytes);
  await fsp.writeFile(files.releasePath, releaseBytes);

  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = buildStorageMigrationDryRun({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_STORAGE_DRY_RUN_TARGET_PROVIDER: "supabase_storage",
      PDM_STORAGE_DRY_RUN_TARGET_BUCKET: "pdm-hot",
      PDM_STORAGE_DRY_RUN_TARGET_PREFIX: "qc"
    }
  });

  record("STORAGE-MIGRATION-DRY-RUN-001 report type is stable", report.reportType === "file-storage-migration-dry-run");
  record("STORAGE-MIGRATION-DRY-RUN-002 dry-run guardrails are explicit", report.assumptions.dryRunOnly === true);
  record("STORAGE-MIGRATION-DRY-RUN-003 no files are copied", report.assumptions.noFilesCopied === true);
  record("STORAGE-MIGRATION-DRY-RUN-004 no files are deleted", report.assumptions.noFilesDeleted === true);
  record("STORAGE-MIGRATION-DRY-RUN-005 metadata pointers are not updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-MIGRATION-DRY-RUN-006 target credentials are not required", report.assumptions.targetCredentialsRequired === false);
  record("STORAGE-MIGRATION-DRY-RUN-007 valid local objects are planned", report.summary.plannedCount === 2, String(report.summary.plannedCount));
  record("STORAGE-MIGRATION-DRY-RUN-008 missing and mismatch objects are blocked", report.summary.blockedCount === 2, String(report.summary.blockedCount));
  record("STORAGE-MIGRATION-DRY-RUN-009 non-local provider objects are skipped", report.summary.skippedCount === 1, String(report.summary.skippedCount));
  record(
    "STORAGE-MIGRATION-DRY-RUN-010 target keys are provider scoped",
    report.planned.every((item) => item.targetProvider === "supabase_storage" && item.targetBucket === "pdm-hot" && item.targetKey.startsWith("qc/"))
  );
  record(
    "STORAGE-MIGRATION-DRY-RUN-011 pointer previews are included",
    report.planned.every((item) => item.pointerPreview && item.pointerPreview.proposedStorageKey === item.targetKey)
  );
  record(
    "STORAGE-MIGRATION-DRY-RUN-012 blocked reasons include missing and mismatch",
    ["source_file_missing", "sha256_mismatch"].every((reason) => report.blocked.some((item) => item.reason === reason))
  );
  record("STORAGE-MIGRATION-DRY-RUN-013 planned bytes are summarized", report.summary.plannedBytes === 20);

  const serialized = JSON.stringify(report);
  record(
    "STORAGE-MIGRATION-DRY-RUN-014 business relationship tables are explicitly untouched",
    report.assumptions.businessRelationshipTablesUntouched === true &&
      report.planned.every((item) =>
        item.businessLinkInvariant?.invariant === "storage_pointer_update_only" &&
        item.businessLinkInvariant.untouchedRelationshipTables.includes("submissions") &&
        item.businessLinkInvariant.untouchedRelationshipTables.includes("bom_lines") &&
        item.businessLinkInvariant.untouchedRelationshipTables.includes("drawing_part_links")
      )
  );
  record(
    "STORAGE-MIGRATION-DRY-RUN-015 pointer updates do not include business relationship fields",
    report.planned.every((item) => {
      const allowed = item.businessLinkInvariant?.allowedPointerFields ?? [];
      return (
        allowed.length > 0 &&
        !allowed.some((field) => ["submission_id", "item_id", "drawing_number", "part_number", "bom_header_id"].includes(field))
      );
    })
  );
  record(
    "STORAGE-MIGRATION-DRY-RUN-016 business keys remain tied to source object identity",
    report.planned.every((item) =>
      item.businessLinkInvariant?.preservedBusinessKeys?.id === item.id &&
      item.businessLinkInvariant.preservedBusinessKeys.source === item.source &&
      item.businessLinkInvariant.preservedBusinessKeys.sha256 === item.sha256
    )
  );
  record("STORAGE-MIGRATION-DRY-RUN-017 report does not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY)/i.test(serialized));

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
