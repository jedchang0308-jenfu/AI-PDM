#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildStorageEgressReport } from "./generate-file-storage-egress-report.mjs";

const results = [];
let tempRoot;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function insertAudit(db, row) {
  db.prepare(
    `INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.submissionId ?? null,
    row.actorId ?? null,
    row.action ?? "StorageAccessed",
    JSON.stringify(row.detail ?? {}),
    row.createdAt
  );
}

function writeFixtureDb(dbPath) {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        submission_id TEXT,
        actor_id TEXT,
        action TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `);

    insertAudit(db, {
      id: "audit-download",
      submissionId: "sub-1",
      actorId: "user-rd",
      createdAt: "2026-06-10T00:00:00.000Z",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "submission_file",
        fileId: "file-1",
        filename: "drawing.pdf",
        bytes: 100,
        disposition: "attachment",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "sub-1/drawing.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:00:00.000Z"
    });
    insertAudit(db, {
      id: "audit-preview",
      submissionId: "sub-1",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "submission_file_preview",
        fileId: "file-1",
        filename: "drawing.pdf",
        bytes: 20,
        disposition: "inline",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "sub-1/drawing.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:01:00.000Z"
    });
    insertAudit(db, {
      id: "audit-release",
      submissionId: "sub-1",
      actorId: "user-manager",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "release_package",
        fileId: "pkg-1",
        filename: "release.zip",
        bytes: 300,
        disposition: "attachment",
        externalAccess: false,
        provider: "supabase_storage",
        bucket: "pdm-hot",
        storageKey: "2026/06/sub-1/release.zip",
        accessMode: "signed_url",
        signedUrlExpiresAt: "2026-06-10T00:06:00.000Z",
        signedUrlExpiresInSeconds: 300,
        authorizationHeaderRequired: false,
        auditRequired: true,
        route: "/api/submissions/[id]/release-package"
      },
      createdAt: "2026-06-10T00:02:00.000Z"
    });
    insertAudit(db, {
      id: "audit-public-1",
      submissionId: "sub-1",
      actorId: null,
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "public_share_package",
        fileId: "pkg-1",
        shareId: "share-1",
        filename: "release.zip",
        bytes: 500,
        disposition: "attachment",
        externalAccess: true,
        provider: "local_repository",
        bucket: null,
        storageKey: "2026/06/sub-1/release.zip",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/public/shares/[token]/package",
        rawToken: "secret-token-value",
        tokenHash: "secret-token-hash",
        signedUrl: "https://storage.example.invalid/signed-secret"
      },
      createdAt: "2026-06-10T00:03:00.000Z"
    });
    insertAudit(db, {
      id: "audit-public-2",
      submissionId: "sub-1",
      actorId: null,
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "public_share_package",
        fileId: "pkg-1",
        shareId: "share-1",
        filename: "release.zip",
        bytes: 700,
        disposition: "attachment",
        externalAccess: true,
        provider: "local_repository",
        bucket: null,
        storageKey: "2026/06/sub-1/release.zip",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/public/shares/[token]/package"
      },
      createdAt: "2026-06-10T00:04:00.000Z"
    });
    insertAudit(db, {
      id: "audit-qc-runtime",
      submissionId: "sub-1",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "qc_api",
        qcRunId: "qc-api-fixture",
        accessKind: "submission_file",
        fileId: "file-qc",
        filename: "qc-fixture.pdf",
        bytes: 900,
        disposition: "attachment",
        externalAccess: false,
        provider: "local_repository",
        bucket: null,
        storageKey: "sub-1/qc-fixture.pdf",
        accessMode: "server_stream",
        signedUrlExpiresAt: null,
        signedUrlExpiresInSeconds: 0,
        authorizationHeaderRequired: true,
        auditRequired: true,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:04:30.000Z"
    });
    insertAudit(db, {
      id: "audit-ignored",
      submissionId: "sub-1",
      actorId: "user-rd",
      action: "Login",
      detail: {
        storageAccess: true,
        bytes: 999
      },
      createdAt: "2026-06-10T00:05:00.000Z"
    });
    insertAudit(db, {
      id: "audit-malformed",
      submissionId: "sub-1",
      actorId: "user-rd",
      detail: {
        storageAccess: true,
        storageAccessSource: "runtime",
        qcRunId: null,
        accessKind: "submission_file",
        bytes: 10,
        route: "/api/submissions/[id]/files/[...filePath]"
      },
      createdAt: "2026-06-10T00:06:00.000Z"
    });
  } finally {
    db.close();
  }
}

async function main() {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-egress-qc-"));
  const dataDir = path.join(tempRoot, "data");
  await fsp.mkdir(dataDir, { recursive: true });
  writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"));

  const report = buildStorageEgressReport({
    root: tempRoot,
    env: {
      PDM_DATA_DIR: dataDir,
      PDM_EGRESS_INCLUDED_GB: "1",
      PDM_EGRESS_WARNING_GB: "0.000001"
    },
    limit: 10
  });

  record("STORAGE-EGRESS-001 report type is stable", report.reportType === "file-storage-egress-audit");
  record("STORAGE-EGRESS-002 fixture database detected", report.inputs.dbExists === true);
  record("STORAGE-EGRESS-003 only StorageAccessed rows are read", report.auditRows.read === 7, String(report.auditRows.read));
  record("STORAGE-EGRESS-004 malformed rows are counted", report.auditRows.malformed === 1, String(report.auditRows.malformed));
  record("STORAGE-EGRESS-005 total audited bytes are summarized", report.egress.total.bytes === 1630, String(report.egress.total.bytes));
  record("STORAGE-EGRESS-006 access kind summary includes public share package", report.egress.byAccessKind.public_share_package.bytes === 1200);
  record("STORAGE-EGRESS-007 route summary includes public package route", report.egress.byRoute["/api/public/shares/[token]/package"].bytes === 1200);
  record(
    "STORAGE-EGRESS-008 provider summary includes Supabase, local, and malformed unknown",
    report.egress.byProvider.supabase_storage.bytes === 300 &&
      report.egress.byProvider.local_repository.bytes === 1320 &&
      report.egress.byProvider.unknown.bytes === 10
  );
  record("STORAGE-EGRESS-009 access mode summary includes signed URL", report.egress.byAccessMode.signed_url.bytes === 300);
  record("STORAGE-EGRESS-010 external access summary is correct", report.egress.byExternalAccess.external.bytes === 1200 && report.egress.byExternalAccess.authenticated.bytes === 430);
  record("STORAGE-EGRESS-011 share id summary is scoped without token", report.egress.byShareId["share-1"].bytes === 1200);
  record(
    "STORAGE-EGRESS-012 top objects aggregate repeated downloads by provider scope",
    report.egress.topObjects[0].storageKey === "2026/06/sub-1/release.zip" &&
      report.egress.topObjects[0].provider === "local_repository" &&
      report.egress.topObjects[0].bytes === 1200
  );
  record("STORAGE-EGRESS-013 threshold usage is calculated", report.thresholdUsage.egressWarningPct > 100);
  record("STORAGE-EGRESS-014 recommendations include public share warning", report.recommendations.some((item) => item.includes("Public share package downloads")));
  record("STORAGE-EGRESS-015 recommendations include malformed row warning", report.recommendations.some((item) => item.includes("missing required fields")));
  record("STORAGE-EGRESS-016 QC runtime rows are excluded from governance totals", report.auditRows.excludedQcRuntime === 1 && report.auditRows.normalizedIncludingExcluded === 7);
  record("STORAGE-EGRESS-017 recommendations identify excluded QC runtime rows", report.recommendations.some((item) => item.includes("QC runtime StorageAccessed rows were excluded")));

  const serialized = JSON.stringify(report);
  record("STORAGE-EGRESS-018 report does not expose raw token values", !serialized.includes("secret-token-value") && !serialized.includes("secret-token-hash"));
  record("STORAGE-EGRESS-019 report does not expose signed URL values", !serialized.includes("signed-secret") && !serialized.includes("storage.example.invalid"));
  record("STORAGE-EGRESS-020 report does not require file reads or provider requests", report.assumptions.noFilesRead === true && report.assumptions.noProviderRequests === true);

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
