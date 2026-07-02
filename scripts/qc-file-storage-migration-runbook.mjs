#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildStorageMigrationRunbook,
  writeStorageMigrationRunbook
} from "./generate-file-storage-migration-runbook.mjs";
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
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-runbook-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const releaseDir = path.join(dataDir, "release-packages", "2026", "06");
  const outputDir = path.join(tempRoot, "runbook-output");
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

  const report = buildStorageMigrationRunbook({
    root: tempRoot,
    batchSize: 1,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_STORAGE_DRY_RUN_TARGET_PROVIDER: "supabase_storage",
      PDM_STORAGE_DRY_RUN_TARGET_BUCKET: "pdm-hot",
      PDM_STORAGE_DRY_RUN_TARGET_PREFIX: "qc"
    }
  });
  const outputs = await writeStorageMigrationRunbook(report, outputDir);

  record("STORAGE-MIGRATION-RUNBOOK-001 report type is stable", report.reportType === "file-storage-migration-runbook");
  record("STORAGE-MIGRATION-RUNBOOK-002 source dry-run is embedded", report.sourceDryRun.reportType === "file-storage-migration-dry-run");
  record("STORAGE-MIGRATION-RUNBOOK-003 runbook guardrail is explicit", report.assumptions.runbookOnly === true);
  record("STORAGE-MIGRATION-RUNBOOK-004 no provider migration is executed", report.assumptions.noProviderMigrationExecuted === true);
  record("STORAGE-MIGRATION-RUNBOOK-005 no files are copied", report.assumptions.noFilesCopied === true);
  record("STORAGE-MIGRATION-RUNBOOK-006 metadata pointers are not updated", report.assumptions.noMetadataPointersUpdated === true);
  record("STORAGE-MIGRATION-RUNBOOK-007 generation needs no provider credentials", report.assumptions.providerCredentialsRequiredForRunbook === false);
  record("STORAGE-MIGRATION-RUNBOOK-008 live execution requires credentials and approval", report.assumptions.providerCredentialsRequiredForExecution === true && report.assumptions.executeRequiresExplicitApproval === true);
  record("STORAGE-MIGRATION-RUNBOOK-025 live execution requires governance gate evidence", report.assumptions.governanceGateRequiredForExecution === true && report.readiness.requiresGovernanceGate === true);
  record("STORAGE-MIGRATION-RUNBOOK-009 valid local objects are planned", report.summary.plannedCount === 2, String(report.summary.plannedCount));
  record("STORAGE-MIGRATION-RUNBOOK-010 missing and mismatch objects block readiness", report.summary.blockedCount === 2 && report.readiness.readyToExecute === false);
  record("STORAGE-MIGRATION-RUNBOOK-011 non-local provider objects are skipped", report.summary.skippedCount === 1, String(report.summary.skippedCount));
  record("STORAGE-MIGRATION-RUNBOOK-012 blocked reasons are promoted to readiness", ["source_file_missing", "sha256_mismatch"].every((reason) => report.readiness.blockedReasons.includes(reason)));
  record("STORAGE-MIGRATION-RUNBOOK-013 batch size is honored", report.summary.batchSize === 1 && report.summary.batchCount === 2 && report.plannedBatches.every((batch) => batch.objectCount === 1));
  record("STORAGE-MIGRATION-RUNBOOK-014 batch object ids preserve planned ids", report.plannedBatches.flatMap((batch) => batch.objectIds).join(",") === report.pointerRollbackPlan.map((item) => item.id).join(","));
  record("STORAGE-MIGRATION-RUNBOOK-015 pointer rollback plan mirrors planned objects", report.pointerRollbackPlan.length === report.summary.plannedCount);
  record(
    "STORAGE-MIGRATION-RUNBOOK-016 rollback entries preserve original local pointer",
    report.pointerRollbackPlan.every((item) => item.rollbackProvider === "local_repository" && item.rollbackLocalPath && item.proposedStorageKey.startsWith("qc/"))
  );
  record(
    "STORAGE-MIGRATION-RUNBOOK-017 execute checklist requires approval governance hash and pointer gate",
    /approval/i.test(JSON.stringify(report.executeChecklist)) &&
      /governance gate/i.test(JSON.stringify(report.executeChecklist)) &&
      /hash/i.test(JSON.stringify(report.executeChecklist)) &&
      /pointer/i.test(JSON.stringify(report.executeChecklist))
  );
  record("STORAGE-MIGRATION-RUNBOOK-018 verify checklist covers hash download and audit", /hash/i.test(JSON.stringify(report.verifyChecklist)) && /download/i.test(JSON.stringify(report.verifyChecklist)) && /audit/i.test(JSON.stringify(report.verifyChecklist)));
  record("STORAGE-MIGRATION-RUNBOOK-019 rollback checklist covers pointer and local SHA", /pointer/i.test(JSON.stringify(report.rollbackChecklist)) && /SHA-256/i.test(JSON.stringify(report.rollbackChecklist)));
  record("STORAGE-MIGRATION-RUNBOOK-020 JSON output is written", await exists(outputs.jsonPath));
  record("STORAGE-MIGRATION-RUNBOOK-021 Markdown output is written", await exists(outputs.markdownPath));
  record("STORAGE-MIGRATION-RUNBOOK-022 rollback plan output is written", await exists(outputs.rollbackPlanPath));
  record(
    "STORAGE-MIGRATION-RUNBOOK-026 runbook command passes governance gate to execution gate",
    report.commands.generateGovernanceGate.includes("storage:governance-gate") &&
      report.commands.stagingExecutionGate.includes("--governance-gate <file-storage-governance-gate.json>")
  );

  const serialized = JSON.stringify(report);
  record("STORAGE-MIGRATION-RUNBOOK-023 report does not expose common cloud secret markers", !/(secret|service_role|X-Amz|BEGIN PRIVATE KEY)/i.test(serialized));

  const packageJson = readProjectFile(root, "package.json");
  record("STORAGE-MIGRATION-RUNBOOK-024 package scripts are registered", packageJson.includes('"storage:migration-runbook"') && packageJson.includes('"qc:file-storage-migration-runbook"'));

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
