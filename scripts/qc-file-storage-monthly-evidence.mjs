#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import {
  buildStorageMonthlyEvidence,
  buildStorageMonthlyEvidenceMarkdown,
  writeStorageMonthlyEvidence
} from "./generate-file-storage-monthly-evidence.mjs";

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
      "sub-monthly",
      "DRW-MONTHLY",
      "A",
      "Released"
    );
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-monthly", "sub-monthly", "pdf", "monthly.pdf", files.pdf, files.pdfHash, 100, "2026-06-10T00:00:00.000Z");
    db.prepare(
      `INSERT INTO submission_files
        (id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("file-missing", "sub-monthly", "pdf", "missing.pdf", files.missing, "missing-hash", 50, "2026-06-10T00:01:00.000Z");
    db.prepare(
      `INSERT INTO release_packages
        (id, submission_id, package_filename, local_path, sha256, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("pkg-monthly", "sub-monthly", "monthly-release.zip", files.releaseZip, files.releaseHash, 200, "2026-06-10T00:02:00.000Z");
    db.prepare(
      `INSERT INTO file_assets
        (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
         hash_algorithm, linked_entity_type, linked_entity_id, document_category, revision, sync_status, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "asset-monthly",
      "supabase_storage",
      null,
      "pdm-hot/monthly.step",
      "monthly.step",
      ".step",
      "application/step",
      300,
      "asset-hash",
      "SHA-256",
      "part_number",
      "PN-MONTHLY",
      "cad",
      "A",
      "migrated",
      null,
      "2026-06-10T00:03:00.000Z"
    );

    insertAudit(db, {
      id: "audit-monthly-internal",
      submissionId: "sub-monthly",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "submission_file",
        fileId: "file-monthly",
        filename: "monthly.pdf",
        bytes: 100,
        disposition: "attachment",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/monthly.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:04:00.000Z"
    });
    insertAudit(db, {
      id: "audit-monthly-public",
      submissionId: "sub-monthly",
      actorId: null,
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "public_share_package",
        fileId: "pkg-monthly",
        shareId: "share-monthly",
        filename: "monthly-release.zip",
        bytes: 500,
        disposition: "attachment",
        externalAccess: true,
        provider: "local_repository",
        bucket: null,
        storageKey: "2026/06/monthly-release.zip",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/public/shares/[token]/package",
        rawToken: "monthly-secret-token",
        tokenHash: "monthly-secret-hash",
        signedUrl: "https://storage.example.invalid/monthly-signed-url"
      },
      createdAt: "2026-06-10T00:05:00.000Z"
    });
    insertAudit(db, {
      id: "audit-monthly-qc-runtime",
      submissionId: "sub-monthly",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "qc_api",
        qcRunId: "qc-monthly-fixture",
        accessKind: "submission_file",
        fileId: "file-monthly",
        filename: "monthly.pdf",
        bytes: 900,
        disposition: "attachment",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/monthly.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:06:00.000Z"
    });
    insertAudit(db, {
      id: "audit-monthly-legacy-unclassified",
      submissionId: "sub-monthly",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        accessKind: "submission_file_preview",
        fileId: "file-monthly",
        filename: "monthly.pdf",
        bytes: 250,
        disposition: "inline",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "released/monthly.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:07:00.000Z"
    });
  } finally {
    db.close();
  }
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-monthly-storage-qc-"));
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(tempRoot, "repository");
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(repositoryDir, { recursive: true });

  const files = {
    pdf: path.join(repositoryDir, "released", "monthly.pdf"),
    missing: path.join(repositoryDir, "released", "missing.pdf"),
    releaseZip: path.join(dataDir, "release-packages", "2026", "06", "monthly-release.zip")
  };
  const pdfBytes = Buffer.alloc(100, "p");
  const releaseBytes = Buffer.alloc(200, "z");
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
    PDM_EGRESS_INCLUDED_GB: "1",
    PDM_EGRESS_WARNING_GB: "0.000001"
  };
  const evidence = await buildStorageMonthlyEvidence({ root: tempRoot, env, period: "2026-06", limit: 10 });
  const markdown = buildStorageMonthlyEvidenceMarkdown(evidence);
  const outputDir = path.join(tempRoot, "monthly-output");
  const filesWritten = await writeStorageMonthlyEvidence(evidence, outputDir);
  const writtenJson = JSON.parse(await fsp.readFile(filesWritten.jsonPath, "utf8"));
  const writtenMarkdown = await fsp.readFile(filesWritten.mdPath, "utf8");

  record("STORAGE-MONTHLY-001 report type is stable", evidence.reportType === "file-storage-monthly-evidence");
  record("STORAGE-MONTHLY-002 period is preserved", evidence.period === "2026-06");
  record("STORAGE-MONTHLY-003 cost report is embedded", evidence.costReport.reportType === "file-storage-cost-inventory");
  record("STORAGE-MONTHLY-004 egress report is embedded", evidence.egressReport.reportType === "file-storage-egress-audit");
  record("STORAGE-MONTHLY-005 storage summary includes metadata objects", evidence.summary.metadataObjectCount === 4);
  record("STORAGE-MONTHLY-006 egress summary includes audited bytes", evidence.summary.auditedEgressBytes === 850);
  record("STORAGE-MONTHLY-007 public share bytes are summarized", evidence.summary.publicShareEgressBytes === 500);
  record("STORAGE-MONTHLY-008 missing local objects block migration readiness", evidence.readiness.migrationReady === false && evidence.readiness.blockers.length === 1);
  record("STORAGE-MONTHLY-009 recommendations merge storage and egress", evidence.recommendations.some((item) => item.startsWith("[storage]")) && evidence.recommendations.some((item) => item.startsWith("[egress]")));
  record("STORAGE-MONTHLY-010 markdown contains PM review sections", markdown.includes("## Summary") && markdown.includes("## Readiness") && markdown.includes("## Recommendations"));
  record("STORAGE-MONTHLY-011 files are written", writtenJson.reportType === evidence.reportType && writtenMarkdown.includes("AI_PDM Storage Monthly Evidence"));
  record("STORAGE-MONTHLY-012 output includes guardrails", evidence.assumptions.noProviderMigrationExecuted === true && markdown.includes("No provider migration was executed."));

  const serialized = `${JSON.stringify(evidence)}\n${markdown}\n${writtenMarkdown}`;
  record("STORAGE-MONTHLY-013 evidence does not expose raw token values", !serialized.includes("monthly-secret-token") && !serialized.includes("monthly-secret-hash"));
  record("STORAGE-MONTHLY-014 evidence does not expose signed URL values", !serialized.includes("monthly-signed-url") && !serialized.includes("storage.example.invalid"));
  record("STORAGE-MONTHLY-015 evidence does not require provider requests", evidence.assumptions.noProviderRequests === true);
  record("STORAGE-MONTHLY-016 QC runtime egress rows are excluded from governance summary", evidence.egressReport.auditRows.excludedQcRuntime === 1 && evidence.summary.excludedQcRuntimeRows === 1 && evidence.summary.auditedEgressBytes === 850);
  record("STORAGE-MONTHLY-017 QC runtime exclusion is visible in recommendations", evidence.recommendations.some((item) => item.includes("QC runtime StorageAccessed rows were excluded")));
  record("STORAGE-MONTHLY-018 legacy unclassified egress rows are summarized", evidence.egressReport.auditRows.legacyUnclassified === 1 && evidence.summary.legacyUnclassifiedRows === 1);
  record("STORAGE-MONTHLY-019 legacy unclassified egress warning is visible", evidence.readiness.warnings.some((item) => item.includes("Legacy StorageAccessed rows without provenance")));

  await fsp.rm(tempRoot, { recursive: true, force: true });

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
