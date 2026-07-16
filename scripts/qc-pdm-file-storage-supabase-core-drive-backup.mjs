#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";
import {
  buildDriveBackupDriftReportFromPlan,
  buildDriveBackupManifestFromPlan,
  buildDriveBackupPlanFromCandidates,
  buildDriveBackupPlanReport,
  buildDriveBackupRestoreIndexFromPlan,
  resolveCollisionSafeDriveFilename
} from "./generate-file-storage-drive-backup-plan.mjs";

const root = process.cwd();
const results = [];
let tempRoot;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function writeFixtureDb(dbPath) {
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
        storage_provider TEXT NOT NULL DEFAULT 'local_repository',
        storage_bucket TEXT,
        storage_key TEXT,
        sha256 TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT
      );
      CREATE TABLE release_packages (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        package_filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        storage_provider TEXT NOT NULL DEFAULT 'local_repository',
        storage_bucket TEXT,
        storage_key TEXT,
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
    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-a", "DRW-001", "A", "Released");
    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run("sub-b", "DRW-001", "B", "Pending");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "file-a",
      "sub-a",
      "pdf",
      "same-name.pdf",
      "supabase://pdm-hot/submissions/sub-a/same-name.pdf",
      "supabase_storage",
      "pdm-hot",
      "submissions/sub-a/same-name.pdf",
      "a".repeat(64),
      10,
      "2026-07-08T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "file-b",
      "sub-b",
      "pdf",
      "same-name.pdf",
      "supabase://pdm-hot/submissions/sub-b/same-name.pdf",
      "supabase_storage",
      "pdm-hot",
      "submissions/sub-b/same-name.pdf",
      "b".repeat(64),
      11,
      "2026-07-08T00:01:00.000Z"
    );
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, storage_provider, storage_bucket, storage_key, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "pkg-a",
      "sub-a",
      "DRW-001_rev-A_release-package.zip",
      "supabase://pdm-release/releases/sub-a/package.zip",
      "supabase_storage",
      "pdm-release",
      "releases/sub-a/package.zip",
      "c".repeat(64),
      22,
      "2026-07-08T00:02:00.000Z"
    );
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-a",
      "supabase_storage",
      "supabase://pdm-hot/master/asset-a.step",
      "master/asset-a.step",
      "asset-a.step",
      ".step",
      "application/step",
      33,
      "d".repeat(64),
      "SHA-256",
      "drawing_number",
      "draw-1",
      "cad_3d",
      "A",
      "migrated",
      null,
      "2026-07-08T00:03:00.000Z"
    );
  } finally {
    db.close();
  }
}

async function main() {
  const packageJson = readProjectJson(root, "package.json");
  const storage = readProjectFile(root, "src/lib/file-storage.ts");
  const backupTs = readProjectFile(root, "src/lib/file-storage-backup.ts");
  const gdrive = readProjectFile(root, "src/lib/gdrive.ts");
  const schema = readProjectFile(root, "db/schema.sql");
  const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
  const supabaseSchema = readProjectFile(root, "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql");
  const fileResponse = readProjectFile(root, "src/lib/file-response.ts");
  const releasePackage = readProjectFile(root, "src/lib/release-package.ts");
  const releasePackageAsync = readProjectFile(root, "src/lib/release-package-async.ts");
  const releaseRoute = readProjectFile(root, "src/app/api/submissions/[id]/release-package/route.ts");
  const publicPackageRoute = readProjectFile(root, "src/app/api/public/shares/[token]/package/route.ts");
  const release = readProjectFile(root, "src/lib/release.ts");
  const releaseAsync = readProjectFile(root, "src/lib/release-async.ts");
  const submissionWrite = readProjectFile(root, "src/lib/repositories/submission-write-async-repository.ts");
  const releaseAsyncRepo = readProjectFile(root, "src/lib/repositories/release-async-repository.ts");
  const backupPlanScript = readProjectFile(root, "scripts/generate-file-storage-drive-backup-plan.mjs");

  record("PDM-FILE-STORAGE-001 package registers Drive backup plan", packageJson.scripts?.["storage:drive-backup-plan"] === "node scripts/generate-file-storage-drive-backup-plan.mjs");
  record("PDM-FILE-STORAGE-002 package registers Supabase core/Drive backup QC", packageJson.scripts?.["qc:pdm-file-storage-supabase-core-drive-backup"] === "node scripts/qc-pdm-file-storage-supabase-core-drive-backup.mjs");
  record("PDM-FILE-STORAGE-003 default factory delegates configured provider", storage.includes("return createConfiguredFileStorageService();"));
  record("PDM-FILE-STORAGE-004 provider-aware service factory exists", storage.includes("createFileStorageServiceForPointer"));
  record("PDM-FILE-STORAGE-005 storage pointer parser supports Supabase pointers", includesAll(storage, ["storagePointerFromRecord", "supabase://", "s3-compatible://"]));
  record("PDM-FILE-STORAGE-006 release package provider bucket override exists", includesAll(storage, ["PDM_SUPABASE_RELEASE_PACKAGE_BUCKET", "pdm-release"]));
  record("PDM-FILE-STORAGE-007 schema adds submission storage pointer columns", includesAll(schema, ["storage_provider TEXT NOT NULL DEFAULT 'local_repository'", "storage_bucket TEXT", "storage_key TEXT"]));
  record("PDM-FILE-STORAGE-008 Postgres schema adds storage pointer columns", includesAll(postgresSchema, ["storage_provider TEXT NOT NULL DEFAULT 'local_repository'", "storage_bucket TEXT", "storage_key TEXT"]));
  record("PDM-FILE-STORAGE-009 Supabase migration adds storage pointer columns", includesAll(supabaseSchema, ["storage_provider TEXT NOT NULL DEFAULT 'local_repository'", "storage_bucket TEXT", "storage_key TEXT"]));
  record("PDM-FILE-STORAGE-010 async submission insert persists storage pointer", includesAll(submissionWrite, ["storage_provider, storage_bucket, storage_key", ":storageProvider, :storageBucket, :storageKey"]));
  record("PDM-FILE-STORAGE-011 release package upsert persists storage pointer", includesAll(releaseAsyncRepo, ["storage_provider, storage_bucket, storage_key", "storage_provider = excluded.storage_provider"]));
  record("PDM-FILE-STORAGE-012 file download reads through provider pointer", includesAll(fileResponse, ["storagePointerFromRecord(file)", "createFileStorageServiceForPointer(storagePointer).readObject"]));
  record("PDM-FILE-STORAGE-013 release package creation reads source provider pointers", includesAll(releasePackage, ["storagePointerFromRecord(file)", "createFileStorageServiceForPointer(storagePointer).readObject"]));
  record("PDM-FILE-STORAGE-014 async release package creation mirrors source pointer handling", includesAll(releasePackageAsync, ["storagePointerFromRecord(file)", "createFileStorageServiceForPointer(storagePointer).readObject"]));
  record("PDM-FILE-STORAGE-015 release package routes use record-aware provider", includesAll(releaseRoute, ["createReleasePackageStorageServiceForRecord", "readReleasePackage"]));
  record("PDM-FILE-STORAGE-016 public share route uses record-aware provider", includesAll(publicPackageRoute, ["createReleasePackageStorageServiceForRecord", "readReleasePackage"]));
  record("PDM-FILE-STORAGE-017 legacy Drive release is local-provider only", includesAll(release, ["legacyLocalDriveRelease", 'PDM_STORAGE_PROVIDER?.trim() || "local_repository"']) && releaseAsync.includes("legacyLocalDriveRelease"));
  record("PDM-FILE-STORAGE-018 gdrive supports folder ensure and byte upload", includesAll(gdrive, ["ensureDriveFolder", "findDriveFileInFolderByName", "uploadBytesToDrive"]));
  record("PDM-FILE-STORAGE-019 backup module marks Google Drive as mirror plan", includesAll(backupTs, ["DriveBackupCoverage", "metadataSnapshot", "metadataStatus", "existing_not_overwritten"]));
  record("PDM-FILE-STORAGE-020 backup plan script documents no delete/overwrite assumption", includesAll(backupPlanScript, ["noDriveDeletesOrOverwritesInFirstVersion", "metadataSnapshotsAreRestoreAidsNotAuthority", "metadataSidecarsPlannedBesideBackedUpBlobs"]));
  record("PDM-FILE-STORAGE-021 backup module exposes manifest, restore and drift helpers", includesAll(backupTs, ["buildDriveBackupManifest", "buildDriveBackupRestoreIndex", "buildDriveBackupDriftReport"]));

  const semanticPlan = buildDriveBackupPlanFromCandidates([
    {
      id: "rel-file-a",
      source: "submission_files",
      filename: "same-name.pdf",
      provider: "supabase_storage",
      bucket: "pdm-hot",
      storageKey: "submissions/a/same-name.pdf",
      businessStatus: "Released",
      linkedEntityType: "submission",
      linkedEntityId: "sub-a",
      revision: "A",
      fileRole: "pdf",
      sha256: "a".repeat(64),
      bytes: 10
    },
    {
      id: "pending-file-b",
      source: "submission_files",
      filename: "same-name.pdf",
      provider: "supabase_storage",
      bucket: "pdm-hot",
      storageKey: "submissions/b/same-name.pdf",
      businessStatus: "Pending",
      linkedEntityType: "submission",
      linkedEntityId: "sub-b",
      revision: "B",
      fileRole: "pdf",
      sha256: "b".repeat(64),
      bytes: 11
    },
    {
      id: "pkg-a",
      source: "release_packages",
      filename: "same-name.pdf",
      provider: "supabase_storage",
      bucket: "pdm-release",
      storageKey: "releases/a/same-name.pdf",
      businessStatus: "ReleasedPackage",
      linkedEntityType: "submission",
      linkedEntityId: "sub-a",
      revision: "A",
      fileRole: "release_package",
      sha256: "c".repeat(64),
      bytes: 20
    },
    {
      id: "preview-a",
      source: "file_derivatives",
      filename: "same-name.pdf",
      provider: "supabase_storage",
      bucket: "pdm-preview",
      storageKey: "previews/a/same-name.pdf",
      derivativeKind: "drawing_pdf",
      sha256: "d".repeat(64),
      bytes: 5
    }
  ]);

  record("PDM-FILE-STORAGE-022 released formal file backup is required", semanticPlan.find((item) => item.id === "rel-file-a")?.coverage === "required");
  record("PDM-FILE-STORAGE-023 pending draft file backup is selective", semanticPlan.find((item) => item.id === "pending-file-b")?.coverage === "selective");
  record("PDM-FILE-STORAGE-024 release package backup is required", semanticPlan.find((item) => item.id === "pkg-a")?.reason === "release_package_required");
  record("PDM-FILE-STORAGE-025 generated preview derivative is excluded", semanticPlan.find((item) => item.id === "preview-a")?.coverage === "excluded");
  record(
    "PDM-FILE-STORAGE-026 same filename different revisions are placed in different Drive folders",
    semanticPlan[0].drive.folderPath.join("/") !== semanticPlan[1].drive.folderPath.join("/")
  );
  record(
    "PDM-FILE-STORAGE-027 same-folder collision gets deterministic PDM suffix",
    resolveCollisionSafeDriveFilename("same-name.pdf", ["same-name.pdf"], "abcdef1234567890") === "same-name__PDM-abcdef123456.pdf"
  );
  const serializedSnapshot = JSON.stringify(semanticPlan[0].metadataSnapshot);
  record(
    "PDM-FILE-STORAGE-028 metadata snapshot excludes secrets, signed URLs, and local paths",
    !/(service_role|secret|signedUrl|signedURL|local_path|C:\\\\|BEGIN PRIVATE KEY)/i.test(serializedSnapshot)
  );
  record(
    "PDM-FILE-STORAGE-029 backup plan defines metadata sidecar filenames",
    semanticPlan[0].drive.metadataFilename === "same-name.pdf.metadata.json"
  );
  const restoreIndex = buildDriveBackupRestoreIndexFromPlan(semanticPlan);
  record(
    "PDM-FILE-STORAGE-030 restore index excludes preview derivatives and preserves Supabase storage keys",
    restoreIndex.entries.length === 3 &&
      restoreIndex.entries.some((entry) => entry.id === "pkg-a" && entry.storage?.bucket === "pdm-release" && entry.storage.key === "releases/a/same-name.pdf")
  );
  const manifest = buildDriveBackupManifestFromPlan(semanticPlan, [
    {
      candidateId: "pkg-a",
      status: "uploaded",
      driveFileId: "drive-pkg-a",
      metadataStatus: "uploaded",
      metadataDriveFileId: "drive-pkg-a-metadata"
    }
  ]);
  record(
    "PDM-FILE-STORAGE-031 manifest template excludes preview derivatives and records Drive/Supabase evidence",
    manifest.entries.length === 3 &&
      manifest.entries.some((entry) => entry.id === "pkg-a" && entry.driveFileId === "drive-pkg-a" && entry.storage?.bucket === "pdm-release" && entry.sha256 === "c".repeat(64))
  );
  const driftReport = buildDriveBackupDriftReportFromPlan(semanticPlan, [
    {
      candidateId: "rel-file-a",
      status: "uploaded",
      metadataStatus: "uploaded"
    }
  ]);
  record(
    "PDM-FILE-STORAGE-032 drift report flags missing required backup execution evidence",
    driftReport.findings.some((finding) => finding.candidateId === "pkg-a" && finding.kind === "missing_result" && finding.severity === "error")
  );

  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-drive-backup-qc-"));
  const dataDir = path.join(tempRoot, "data");
  await fsp.mkdir(dataDir, { recursive: true });
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"));
  const report = buildDriveBackupPlanReport({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: path.join(tempRoot, "repository")
    }
  });
  record("PDM-FILE-STORAGE-033 backup plan report type is stable", report.reportType === "file-storage-drive-backup-plan");
  record("PDM-FILE-STORAGE-034 backup plan treats Drive as backup only", report.assumptions.googleDriveIsBackupMirrorOnly === true && report.assumptions.googleDriveDoesNotServeRuntimeReads === true);
  record("PDM-FILE-STORAGE-035 backup plan counts required and selective objects", report.summary.required === 2 && report.summary.selective === 2, JSON.stringify(report.summary));
  record(
    "PDM-FILE-STORAGE-036 backup plan preserves Supabase bucket/key metadata",
    report.plan.some((item) => item.storage?.provider === "supabase_storage" && item.storage.bucket === "pdm-release" && item.storage.key === "releases/sub-a/package.zip")
  );
  record(
    "PDM-FILE-STORAGE-037 backup plan report includes manifest/restore/drift sections",
    report.manifestTemplate?.schema === "ai-pdm-drive-backup-manifest.v1" &&
      report.restoreIndex?.schema === "ai-pdm-drive-backup-restore-index.v1" &&
      report.driftReportTemplate?.schema === "ai-pdm-drive-backup-drift-report.v1"
  );

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
