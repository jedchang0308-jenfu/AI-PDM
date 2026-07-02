#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildStorageDedupReferenceDryRun } from "./generate-file-storage-dedup-reference-dry-run.mjs";
import { sha256Bytes } from "./qc-file-hash-utils.mjs";

const results = [];
let tempRoot;

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
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

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-1", "DRW-DEDUP-001", "A", "Released");
    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-2", "DRW-DEDUP-002", "A", "Pending");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("dup-sub-file", "sub-1", "pdf", "dup-a.pdf", files.dupSubmissionPath, files.dupHash, 8, "2026-06-11T00:00:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("dup-release-package", "sub-1", "release.zip", files.dupReleasePath, files.dupHash, 8, "2026-06-11T00:01:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("blocked-present", "sub-2", "pdf", "blocked-present.pdf", files.blockedPresentPath, files.blockedHash, 10, "2026-06-11T00:02:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("blocked-missing", "sub-2", "pdf", "blocked-missing.pdf", files.blockedMissingPath, files.blockedHash, 10, "2026-06-11T00:03:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "dup-local-asset",
      "j_drive",
      files.dupAssetPath,
      "legacy/dup-local-asset.pdf",
      "dup-local-asset.pdf",
      ".pdf",
      "application/pdf",
      8,
      files.dupHash,
      "SHA-256",
      "part_number",
      "P-DEDUP-001",
      "cad",
      "A",
      "ready",
      null,
      "2026-06-11T00:04:00.000Z"
    );
    for (const [id, bytes, createdAt] of [
      ["remote-1", 20, "2026-06-11T00:05:00.000Z"],
      ["remote-2", 30, "2026-06-11T00:06:00.000Z"]
    ]) {
      db.prepare(
        `INSERT INTO file_assets
          (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
           hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        "supabase_storage",
        null,
        `pdm-hot/${id}.step`,
        `${id}.step`,
        ".step",
        "application/step",
        bytes,
        files.remoteHash,
        "SHA-256",
        "part_number",
        `P-${id}`,
        "cad",
        "A",
        "migrated",
        null,
        createdAt
      );
    }
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "no-hash",
      "supabase_storage",
      null,
      "pdm-hot/no-hash.step",
      "no-hash.step",
      ".step",
      "application/step",
      5,
      null,
      null,
      "part_number",
      "P-NOHASH",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-11T00:07:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-dedup-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages");
  const outputDir = path.join(tempRoot, "out");
  await fsp.mkdir(repositoryDir, { recursive: true });
  await fsp.mkdir(releaseDir, { recursive: true });

  const dupBytes = Buffer.alloc(8, "d");
  const blockedBytes = Buffer.alloc(10, "b");
  const files = {
    dupSubmissionPath: path.join(repositoryDir, "dup-a.pdf"),
    dupReleasePath: path.join(releaseDir, "release.zip"),
    dupAssetPath: path.join(repositoryDir, "dup-local-asset.pdf"),
    blockedPresentPath: path.join(repositoryDir, "blocked-present.pdf"),
    blockedMissingPath: path.join(repositoryDir, "blocked-missing.pdf"),
    dupHash: sha256Bytes(dupBytes),
    blockedHash: sha256Bytes(blockedBytes),
    remoteHash: "f".repeat(64)
  };

  await fsp.writeFile(files.dupSubmissionPath, dupBytes);
  await fsp.writeFile(files.dupReleasePath, dupBytes);
  await fsp.writeFile(files.dupAssetPath, dupBytes);
  await fsp.writeFile(files.blockedPresentPath, blockedBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const report = buildStorageDedupReferenceDryRun({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir
    }
  });

  record("STORAGE-DEDUP-001 report type is stable", report.reportType === "file-storage-dedup-reference-dry-run");
  record("STORAGE-DEDUP-002 dry-run guardrails are explicit", report.assumptions.dryRunOnly === true && report.assumptions.noObjectsMerged === true);
  record("STORAGE-DEDUP-003 metadata pointers are not updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-DEDUP-004 schema is not applied", report.assumptions.noSchemaMigrationExecuted === true && report.targetSchema.status === "blueprint_not_applied");
  record("STORAGE-DEDUP-005 candidate groups include local and remote duplicate sets", report.summary.candidateGroupCount === 2, String(report.summary.candidateGroupCount));
  record("STORAGE-DEDUP-006 candidate references are counted", report.summary.candidateReferenceCount === 5, String(report.summary.candidateReferenceCount));
  record("STORAGE-DEDUP-007 recoverable bytes are estimated", report.summary.estimatedRecoverableBytes === 46, String(report.summary.estimatedRecoverableBytes));
  record("STORAGE-DEDUP-008 blocked groups include missing local files", report.summary.blockedGroupCount === 1 && report.blocked.some((group) => group.reasons.includes("source_file_missing")));
  record("STORAGE-DEDUP-009 no-hash objects are skipped", report.summary.skippedObjectCount === 1 && report.skipped.some((item) => item.reason === "sha256_missing"));
  record(
    "STORAGE-DEDUP-010 canonical object prefers release package or released record",
    report.candidateGroups.some((group) => group.canonicalObject.id === "dup-release-package" && group.canonicalObject.fileRole !== "release_package")
      ? false
      : report.candidateGroups.some((group) => group.canonicalObject.id === "dup-release-package")
  );
  record("STORAGE-DEDUP-011 reference previews preserve business identity", report.candidateGroups.some((group) => group.references.some((reference) => reference.linkedEntityId === "P-DEDUP-001" && reference.fileRole === "cad")));
  record("STORAGE-DEDUP-012 remote duplicates remain metadata-only", report.candidateGroups.some((group) => group.verificationModes.includes("metadata_only_remote_provider")));
  record("STORAGE-DEDUP-013 recommendations require schema before replacement", report.recommendations.some((item) => /storage_objects/i.test(item)));

  await fsp.mkdir(outputDir, { recursive: true });
  const childProcess = await import("node:child_process");
  childProcess.execFileSync(process.execPath, ["scripts/generate-file-storage-dedup-reference-dry-run.mjs", "--output", outputDir], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir
    },
    stdio: "pipe"
  });
  record("STORAGE-DEDUP-014 JSON output is written", await exists(path.join(outputDir, "storage-dedup-reference-dry-run.json")));
  record("STORAGE-DEDUP-015 Markdown output is written", await exists(path.join(outputDir, "storage-dedup-reference-dry-run.md")));

  const serialized = JSON.stringify(report);
  record("STORAGE-DEDUP-016 report does not expose common cloud secret markers", !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized));
  record("STORAGE-DEDUP-017 package scripts are registered", (await fsp.readFile(path.join(process.cwd(), "package.json"), "utf8")).includes('"storage:dedup-reference-dry-run"') && (await fsp.readFile(path.join(process.cwd(), "package.json"), "utf8")).includes('"qc:file-storage-dedup-reference"'));

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
