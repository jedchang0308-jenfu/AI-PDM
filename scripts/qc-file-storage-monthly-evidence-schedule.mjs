#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runStorageMonthlyEvidenceSchedule } from "./run-file-storage-monthly-evidence-schedule.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function insertAudit(db, row) {
  db.prepare(
    `INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.submissionId ?? null,
    row.actorId ?? null,
    "StorageAccessed",
    JSON.stringify(row.detail),
    row.createdAt
  );
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
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        submission_id TEXT,
        actor_id TEXT,
        action TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `);

    db.prepare("INSERT INTO submissions (id, drawing_number, revision, status) VALUES (?, ?, ?, ?)").run(
      "sub-schedule",
      "DRW-SCHEDULE",
      "A",
      "Released"
    );
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-schedule", "sub-schedule", "pdf", "schedule.pdf", files.pdf, files.pdfHash, 128, "2026-06-10T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-schedule-missing", "sub-schedule", "pdf", "missing.pdf", files.missing, "missing-hash", 64, "2026-06-10T00:01:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-schedule", "sub-schedule", "schedule-release.zip", files.releaseZip, files.releaseHash, 256, "2026-06-10T00:02:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-schedule",
      "supabase_storage",
      null,
      "pdm-hot/schedule.step",
      "schedule.step",
      ".step",
      "application/step",
      512,
      "asset-hash",
      "SHA-256",
      "part_number",
      "PN-SCHEDULE",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-10T00:03:00.000Z"
    );

    insertAudit(db, {
      id: "audit-schedule-internal",
      submissionId: "sub-schedule",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "submission_file",
        fileId: "file-schedule",
        filename: "schedule.pdf",
        bytes: 128,
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/schedule.pdf",
        accessMode: "server_stream",
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:04:00.000Z"
    });
    insertAudit(db, {
      id: "audit-schedule-public",
      submissionId: "sub-schedule",
      actorId: null,
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "public_share_package",
        fileId: "pkg-schedule",
        shareId: "share-schedule",
        filename: "schedule-release.zip",
        bytes: 256,
        externalAccess: true,
        provider: "local_repository",
        bucket: null,
        storageKey: "2026/06/schedule-release.zip",
        accessMode: "server_stream",
        route: "/api/public/shares/[token]/package",
        rawToken: "schedule-secret-token",
        tokenHash: "schedule-secret-hash",
        signedUrl: "https://storage.example.invalid/schedule-signed-url"
      },
      createdAt: "2026-06-10T00:05:00.000Z"
    });
    insertAudit(db, {
      id: "audit-schedule-qc-runtime",
      submissionId: "sub-schedule",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "qc_api",
        qcRunId: "qc-schedule-fixture",
        accessKind: "submission_file",
        fileId: "file-schedule",
        filename: "schedule.pdf",
        bytes: 512,
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/schedule.pdf",
        accessMode: "server_stream",
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:06:00.000Z"
    });
    insertAudit(db, {
      id: "audit-schedule-legacy",
      submissionId: "sub-schedule",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        accessKind: "submission_file_preview",
        fileId: "file-schedule",
        filename: "schedule.pdf",
        bytes: 64,
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/schedule.pdf",
        accessMode: "server_stream",
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:07:00.000Z"
    });
  } finally {
    db.close();
  }
}

function readText(filePath) {
  return fsp.readFile(filePath, "utf8");
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schedule-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  const outputDir = path.join(tempRoot, "scheduled-output");
  const latestOutput = path.join(tempRoot, "latest", "latest-storage-monthly-evidence-run.json");
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(repositoryDir, { recursive: true });

  const files = {
    pdf: path.join(repositoryDir, "released", "schedule.pdf"),
    missing: path.join(repositoryDir, "released", "missing.pdf"),
    releaseZip: path.join(dataDir, "release-packages", "2026", "06", "schedule-release.zip")
  };
  const pdfBytes = Buffer.alloc(128, "p");
  const releaseBytes = Buffer.alloc(256, "z");
  files.pdfHash = sha256(pdfBytes);
  files.releaseHash = sha256(releaseBytes);
  await fsp.mkdir(path.dirname(files.pdf), { recursive: true });
  await fsp.mkdir(path.dirname(files.releaseZip), { recursive: true });
  await fsp.writeFile(files.pdf, pdfBytes);
  await fsp.writeFile(files.releaseZip, releaseBytes);
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"), files);

  const env = {
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_STORAGE_INCLUDED_GB: "1",
    PDM_EGRESS_INCLUDED_GB: "1"
  };
  const run = await runStorageMonthlyEvidenceSchedule({
    root: tempRoot,
    env,
    output: outputDir,
    latestOutput,
    period: "2026-06",
    failOnBlocker: true,
    now: new Date("2026-06-10T07:00:00.000Z")
  });
  const manifestText = await readText(run.manifestPath);
  const latestText = await readText(latestOutput);
  const evidenceJsonPath = path.join(outputDir, "storage-monthly-evidence.json");
  const evidenceMarkdownPath = path.join(outputDir, "storage-monthly-evidence.md");
  const evidence = JSON.parse(await readText(evidenceJsonPath));
  const markdown = await readText(evidenceMarkdownPath);
  const installTaskSource = await readText(path.join(root, "scripts", "install-storage-monthly-evidence-task.ps1"));
  const runnerSource = await readText(path.join(root, "scripts", "run-file-storage-monthly-evidence-schedule.mjs"));

  record("STORAGE-SCHEDULE-001 scheduled manifest type is stable", run.manifest.reportType === "file-storage-monthly-evidence-scheduled-run");
  record("STORAGE-SCHEDULE-002 scheduled run preserves period", run.manifest.period === "2026-06");
  record("STORAGE-SCHEDULE-003 blocked readiness maps to blocked status", run.manifest.status === "blocked");
  record("STORAGE-SCHEDULE-004 fail-on-blocker maps to nonzero suggested exit code", run.exitCode === 2 && run.manifest.suggestedExitCode === 2);
  record("STORAGE-SCHEDULE-005 evidence files are written", evidence.reportType === "file-storage-monthly-evidence" && markdown.includes("AI_PDM Storage Monthly Evidence"));
  record("STORAGE-SCHEDULE-006 run manifest and latest manifest are written", manifestText.includes(run.manifest.runId) && latestText.includes(run.manifest.runId));
  record("STORAGE-SCHEDULE-007 manifest records PM/QC commands", run.manifest.commands.scheduled.includes("storage:monthly-evidence:scheduled") && run.manifest.commands.qc.includes("qc:file-storage-monthly-evidence-schedule"));
  record("STORAGE-SCHEDULE-008 manifest avoids raw evidence payload duplication", !manifestText.includes("costReport") && !manifestText.includes("egressReport"));
  record("STORAGE-SCHEDULE-014 manifest carries evidence quality counts", run.manifest.evidenceQuality.excludedQcRuntimeRows === 1 && run.manifest.evidenceQuality.legacyUnclassifiedRows === 1);
  record("STORAGE-SCHEDULE-015 manifest flags provenance review requirement", run.manifest.evidenceQuality.provenanceReviewRequired === true && run.manifest.evidenceQuality.qcRuntimeRowsExcluded === true);
  record("STORAGE-SCHEDULE-016 evidence quality warnings are handoff safe", run.manifest.evidenceQuality.warnings.some((item) => item.includes("Legacy StorageAccessed")) && run.manifest.evidenceQuality.warnings.some((item) => item.includes("QC runtime")));

  const serialized = `${manifestText}\n${latestText}\n${JSON.stringify(evidence)}\n${markdown}`;
  record("STORAGE-SCHEDULE-009 scheduled evidence does not expose raw token values", !serialized.includes("schedule-secret-token") && !serialized.includes("schedule-secret-hash"));
  record("STORAGE-SCHEDULE-010 scheduled evidence does not expose signed URL values", !serialized.includes("schedule-signed-url") && !serialized.includes("storage.example.invalid"));
  record("STORAGE-SCHEDULE-011 guardrails keep provider requests disabled", run.manifest.guardrails.noProviderRequests === true && evidence.assumptions.noProviderRequests === true);
  record("STORAGE-SCHEDULE-012 installer registers monthly task", installTaskSource.includes("New-ScheduledTaskTrigger -Monthly") && installTaskSource.includes("storage:monthly-evidence:scheduled"));
  record("STORAGE-SCHEDULE-013 runner supports latest manifest control", runnerSource.includes("--latest-output") && runnerSource.includes("--no-latest"));
  record("STORAGE-SCHEDULE-017 runner writes evidenceQuality handoff", runnerSource.includes("evidenceQuality: evidenceQuality(evidence.summary, evidence.readiness)"));

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
