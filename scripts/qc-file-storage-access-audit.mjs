#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildStorageEgressReport } from "./generate-file-storage-egress-report.mjs";

const results = [];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

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

function storageAccessDetail(overrides) {
  return {
    storageAccess: true,
    storageAccessSource: "runtime",
    qcRunId: null,
    accessKind: "submission_file",
    fileId: "file-audit",
    shareId: null,
    filename: "fixture.pdf",
    bytes: 100,
    disposition: "attachment",
    externalAccess: false,
    provider: "local_repository",
    bucket: null,
    storageKey: "sub-audit/fixture.pdf",
    accessMode: "server_stream",
    signedUrlExpiresAt: null,
    signedUrlExpiresInSeconds: 0,
    authorizationHeaderRequired: true,
    auditRequired: true,
    route: "/api/submissions/[id]/files/[...filePath]",
    ...overrides
  };
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
      id: "storage-audit-download",
      submissionId: "sub-audit",
      actorId: "user-engineer",
      detail: storageAccessDetail({
        accessKind: "submission_file",
        bytes: 110,
        route: "/api/submissions/[id]/files/[...filePath]"
      }),
      createdAt: "2026-06-11T00:00:00.000Z"
    });
    insertAudit(db, {
      id: "storage-audit-preview",
      submissionId: "sub-audit",
      actorId: "user-engineer",
      detail: storageAccessDetail({
        accessKind: "submission_file_preview",
        bytes: 90,
        disposition: "inline",
        route: "/api/submissions/[id]/files/[...filePath]"
      }),
      createdAt: "2026-06-11T00:01:00.000Z"
    });
    insertAudit(db, {
      id: "storage-audit-release",
      submissionId: "sub-audit",
      actorId: "user-manager",
      detail: storageAccessDetail({
        accessKind: "release_package",
        fileId: "pkg-audit",
        filename: "release.zip",
        bytes: 300,
        provider: "supabase_storage",
        bucket: "pdm-hot",
        storageKey: "releases/sub-audit/release.zip",
        accessMode: "signed_url",
        signedUrlExpiresAt: "2026-06-11T00:06:00.000Z",
        signedUrlExpiresInSeconds: 300,
        authorizationHeaderRequired: false,
        route: "/api/submissions/[id]/release-package"
      }),
      createdAt: "2026-06-11T00:02:00.000Z"
    });
    insertAudit(db, {
      id: "storage-audit-public-share",
      submissionId: "sub-audit",
      actorId: null,
      detail: storageAccessDetail({
        accessKind: "public_share_package",
        fileId: "pkg-audit",
        shareId: "share-audit",
        filename: "release.zip",
        bytes: 500,
        storageKey: "releases/sub-audit/release.zip",
        route: "/api/public/shares/[token]/package",
        externalAccess: true,
        rawToken: "qc-raw-token-must-not-leak",
        tokenHash: "qc-token-hash-must-not-leak",
        signedUrl: "https://storage.example.invalid/qc-signed-url-must-not-leak"
      }),
      createdAt: "2026-06-11T00:03:00.000Z"
    });
    insertAudit(db, {
      id: "storage-audit-qc-runtime",
      submissionId: "sub-audit",
      actorId: "user-engineer",
      detail: storageAccessDetail({
        storageAccessSource: "qc_api",
        qcRunId: "qc-access-audit-fixture",
        accessKind: "submission_file",
        bytes: 1000
      }),
      createdAt: "2026-06-11T00:04:00.000Z"
    });
  } finally {
    db.close();
  }
}

async function main() {
  const storageAccessAudit = read("src/lib/storage-access-audit.ts");
  const submissionFileRoute = read("src/app/api/submissions/[id]/files/[...filePath]/route.ts");
  const releasePackageRoute = read("src/app/api/submissions/[id]/release-package/route.ts");
  const publicSharePackageRoute = read("src/app/api/public/shares/[token]/package/route.ts");
  const egressReport = read("scripts/generate-file-storage-egress-report.mjs");
  const apiQc = read("scripts/qc-api-test.mjs");
  const packageJson = JSON.parse(read("package.json"));

  record("STORAGE-ACCESS-AUDIT-001 helper emits StorageAccessed action", storageAccessAudit.includes('action: "StorageAccessed"'));
  record("STORAGE-ACCESS-AUDIT-002 helper records storageAccess flag", storageAccessAudit.includes("storageAccess: true"));
  record("STORAGE-ACCESS-AUDIT-003 helper supports authenticated download kind", storageAccessAudit.includes('"submission_file"'));
  record("STORAGE-ACCESS-AUDIT-004 helper supports authenticated preview kind", storageAccessAudit.includes('"submission_file_preview"'));
  record("STORAGE-ACCESS-AUDIT-005 helper supports release package kind", storageAccessAudit.includes('"release_package"'));
  record("STORAGE-ACCESS-AUDIT-006 helper supports public share package kind", storageAccessAudit.includes('"public_share_package"'));
  record("STORAGE-ACCESS-AUDIT-007 helper records route and provider key", storageAccessAudit.includes("route: input.route") && storageAccessAudit.includes("storageKey: input.storageKey"));
  record("STORAGE-ACCESS-AUDIT-008 helper records TTL policy but omits URL value", storageAccessAudit.includes("signedUrlExpiresAt: input.access.expiresAt") && !storageAccessAudit.includes("input.access.url"));
  record("STORAGE-ACCESS-AUDIT-009 helper allows anonymous external actor", storageAccessAudit.includes("actorId?: string | null") && storageAccessAudit.includes("externalAccess: input.externalAccess ?? false"));
  record("STORAGE-ACCESS-AUDIT-010 helper records audit provenance", storageAccessAudit.includes("storageAccessSource") && storageAccessAudit.includes("qcRunId"));
  record("STORAGE-ACCESS-AUDIT-011 helper only honors QC provenance outside production", storageAccessAudit.includes("process.env.NODE_ENV !== \"production\"") && storageAccessAudit.includes("x-ai-pdm-qc-storage-audit-run-id"));

  record("STORAGE-ACCESS-AUDIT-012 submission route audits after creating access contract", submissionFileRoute.indexOf("createFileStorageService().createDownloadUrl") < submissionFileRoute.indexOf("await auditStorageAccess"));
  record("STORAGE-ACCESS-AUDIT-013 submission route classifies download and preview", submissionFileRoute.includes('"submission_file_preview"') && submissionFileRoute.includes('"submission_file"'));
  record("STORAGE-ACCESS-AUDIT-014 submission route records byte length", submissionFileRoute.includes("bytes: result.bytes.byteLength"));
  record("STORAGE-ACCESS-AUDIT-015 submission route passes audit provenance", submissionFileRoute.includes("resolveStorageAccessAuditProvenance(request.headers)"));
  record("STORAGE-ACCESS-AUDIT-016 release route audits release package", releasePackageRoute.includes('accessKind: "release_package"') && releasePackageRoute.includes("getReleasePackageStorageKey"));
  record("STORAGE-ACCESS-AUDIT-017 release route passes audit provenance", releasePackageRoute.includes("resolveStorageAccessAuditProvenance(request.headers)"));
  record("STORAGE-ACCESS-AUDIT-018 public share route audits external package access", publicSharePackageRoute.includes('accessKind: "public_share_package"') && publicSharePackageRoute.includes("externalAccess: true"));
  record("STORAGE-ACCESS-AUDIT-019 public share route records share id without token hash", publicSharePackageRoute.includes("shareId: publicShare.share.id") && !publicSharePackageRoute.includes("tokenHash"));
  record("STORAGE-ACCESS-AUDIT-020 public share route passes audit provenance", publicSharePackageRoute.includes("resolveStorageAccessAuditProvenance(request.headers)"));

  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-access-audit-qc-"));
  try {
    const dataDir = path.join(tempRoot, "data");
    await fsp.mkdir(dataDir, { recursive: true });
    writeFixtureDb(path.join(dataDir, "ai-pdm.sqlite"));

    const report = buildStorageEgressReport({
      root: tempRoot,
      env: {
        PDM_DATA_DIR: dataDir,
        PDM_EGRESS_INCLUDED_GB: "1",
        PDM_EGRESS_WARNING_GB: "1"
      },
      limit: 10
    });

    record("STORAGE-ACCESS-AUDIT-021 egress report reads five audit rows", report.auditRows.read === 5, String(report.auditRows.read));
    record("STORAGE-ACCESS-AUDIT-022 egress report has no malformed rows for helper schema", report.auditRows.malformed === 0, String(report.auditRows.malformed));
    record("STORAGE-ACCESS-AUDIT-023 egress total bytes include governance access kinds only", report.egress.total.bytes === 1000, String(report.egress.total.bytes));
    record("STORAGE-ACCESS-AUDIT-024 egress groups authenticated download bytes", report.egress.byAccessKind.submission_file.bytes === 110);
    record("STORAGE-ACCESS-AUDIT-025 egress groups preview bytes", report.egress.byAccessKind.submission_file_preview.bytes === 90);
    record("STORAGE-ACCESS-AUDIT-026 egress groups release package bytes", report.egress.byAccessKind.release_package.bytes === 300);
    record("STORAGE-ACCESS-AUDIT-027 egress groups public share bytes", report.egress.byAccessKind.public_share_package.bytes === 500);
    record("STORAGE-ACCESS-AUDIT-028 egress preserves signed URL metadata only", report.egress.byAccessMode.signed_url.bytes === 300 && report.egress.byProvider.supabase_storage.bytes === 300);
    record("STORAGE-ACCESS-AUDIT-029 egress scopes public share by share id", report.egress.byShareId["share-audit"].bytes === 500);
    record("STORAGE-ACCESS-AUDIT-030 egress excludes QC runtime rows from governance totals", report.auditRows.excludedQcRuntime === 1 && report.auditRows.normalizedIncludingExcluded === 5);

    const serialized = JSON.stringify(report);
    record(
      "STORAGE-ACCESS-AUDIT-031 egress output redacts tokens and signed URLs",
      !serialized.includes("qc-raw-token-must-not-leak") &&
        !serialized.includes("qc-token-hash-must-not-leak") &&
        !serialized.includes("qc-signed-url-must-not-leak") &&
        !serialized.includes("storage.example.invalid")
    );
  record("STORAGE-ACCESS-AUDIT-032 egress generator keeps no-provider-request assumption", report.assumptions.noProviderRequests === true && report.assumptions.signedUrlsAreNotReported === true);
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }

  record("STORAGE-ACCESS-AUDIT-033 qc:api checks runtime download and preview audit rows", apiQc.includes("FILE-006 file download writes StorageAccessed audit") && apiQc.includes("FILE-007 file preview writes StorageAccessed audit"));
  record("STORAGE-ACCESS-AUDIT-034 qc:api checks runtime release package audit row", apiQc.includes("PKG-009 package download writes StorageAccessed audit"));
  record("STORAGE-ACCESS-AUDIT-035 qc:api checks runtime public package audit row", apiQc.includes("SHARE-012 public package writes StorageAccessed audit"));
  record("STORAGE-ACCESS-AUDIT-036 qc:api sends QC provenance header", apiQc.includes("x-ai-pdm-qc-storage-audit-run-id"));
  record("STORAGE-ACCESS-AUDIT-037 package exposes focused QC script", packageJson.scripts?.["qc:file-storage-access-audit"] === "node scripts/qc-file-storage-access-audit.mjs");
  record("STORAGE-ACCESS-AUDIT-038 egress parser requires storageAccess flag", egressReport.includes("detail.storageAccess !== true"));
  record("STORAGE-ACCESS-AUDIT-039 egress parser flags legacy unclassified provenance", egressReport.includes("legacyUnclassifiedRows") && egressReport.includes("missing_storage_access_source"));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
});
