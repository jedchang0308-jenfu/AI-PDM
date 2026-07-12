#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function ordered(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

try {
  const packageJson = readProjectJson(root, "package.json");
  const storage = readProjectFile(root, "src/lib/file-storage.ts");
  const fileStore = readProjectFile(root, "src/lib/file-store.ts");
  const fileResponse = readProjectFile(root, "src/lib/file-response.ts");
  const submissionFileRoute = readProjectFile(root, "src/app/api/submissions/[id]/files/[...filePath]/route.ts");
  const releasePackageFile = readProjectFile(root, "src/lib/release-package-file.ts");
  const releasePackageRoute = readProjectFile(root, "src/app/api/submissions/[id]/release-package/route.ts");
  const publicSharePackageRoute = readProjectFile(root, "src/app/api/public/shares/[token]/package/route.ts");
  const costReport = readProjectFile(root, "scripts/generate-file-storage-cost-report.mjs");
  const costReportQc = readProjectFile(root, "scripts/qc-file-storage-cost-report.mjs");
  const contractQc = readProjectFile(root, "scripts/qc-file-storage-contract.mjs");
  const accessAuditQc = readProjectFile(root, "scripts/qc-file-storage-access-audit.mjs");
  const apiQc = readProjectFile(root, "scripts/qc-api-test.mjs");

  record("LOCAL-STORAGE-REGRESSION-001 package script is registered", packageJson.scripts?.["qc:file-storage-local-provider-regression"] === "node scripts/qc-file-storage-local-provider-regression.mjs");

  record("LOCAL-STORAGE-REGRESSION-002 default runtime provider still resolves local", storage.includes('env.PDM_STORAGE_PROVIDER?.trim() || "local_repository"') && storage.includes("return createConfiguredFileStorageService();"));
  record("LOCAL-STORAGE-REGRESSION-003 local provider remains server-streamed", includesAll(storage, ['mode: "server_stream"', "url: null", "auditRequired: true", "authorizationHeaderRequired: true"]));
  record("LOCAL-STORAGE-REGRESSION-004 local provider guards repository boundary", includesAll(storage, ["path.resolve", "Storage object key resolves outside repository root", "normalizeStorageKey"]));

  record("LOCAL-STORAGE-REGRESSION-005 upload path writes through FileStorageService", includesAll(fileStore, ["createFileStorageService", "storage.putObject", "buildStorageKey"]));
  record("LOCAL-STORAGE-REGRESSION-006 upload keeps submission metadata contract", includesAll(fileStore, ["fileRole: normalizeFileRole(file.filename)", "originalFilename: file.filename", "localPath: stored.localPath", "storageProvider: pointer.provider", "storageBucket: pointer.bucket", "storageKey: pointer.key", "sha256: stored.sha256", "fileSize: stored.bytes"]));
  record("LOCAL-STORAGE-REGRESSION-007 upload keeps pending date folder key", includesAll(fileStore, ['"pending"', "yyyy", "mm", "submissionFolderName", "safeName"]));

  record("LOCAL-STORAGE-REGRESSION-008 file response reads through provider-aware storage service", includesAll(fileResponse, ["storagePointerFromRecord(file)", "createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key)"]));
  record("LOCAL-STORAGE-REGRESSION-009 file response keeps attachment and inline disposition", includesAll(fileResponse, ['disposition: "inline" | "attachment"', '"content-disposition"', "contentDispositionFilename"]));
  record("LOCAL-STORAGE-REGRESSION-010 file response keeps PDF content type", includesAll(fileResponse, ["isPdfFile", '"application/pdf"', 'file.file_role === "pdf"']));
  record("LOCAL-STORAGE-REGRESSION-011 file response keeps private no-store headers", includesAll(fileResponse, ['"x-content-type-options": "nosniff"', '"cache-control": "private, no-store"']));

  record("LOCAL-STORAGE-REGRESSION-012 file route supports download URL shape", includesAll(submissionFileRoute, ["filePath.length === 1", 'disposition: "attachment"']));
  record("LOCAL-STORAGE-REGRESSION-013 file route supports PDF preview URL shape", includesAll(submissionFileRoute, ['filePath[0] === "preview"', 'disposition: "inline"', "Only PDF files can be previewed"]));
  record("LOCAL-STORAGE-REGRESSION-014 file route creates audited access contract before response", ordered(submissionFileRoute, "createFileStorageServiceForPointer(result.storagePointer).createDownloadUrl", "await auditStorageAccess"));
  record("LOCAL-STORAGE-REGRESSION-015 file route separates preview and download audit kinds", includesAll(submissionFileRoute, ['"submission_file_preview"', '"submission_file"', 'route: "/api/submissions/[id]/files/[...filePath]"']));

  record("LOCAL-STORAGE-REGRESSION-016 release package file is root-bound and storage-backed", includesAll(releasePackageFile, ["getReleasePackageRoot", "RELEASE_PACKAGE_PATH_OUTSIDE_ROOT", "createReleasePackageStorageServiceForRecord"]));
  record("LOCAL-STORAGE-REGRESSION-017 release package route only serves released/obsolete submissions", includesAll(releasePackageRoute, ['submission.status !== "Released" && submission.status !== "Obsolete"', "return NextResponse.json", "{ status: 409 }"]));
  record("LOCAL-STORAGE-REGRESSION-018 release package route audits package download", includesAll(releasePackageRoute, ['purpose: "release_package"', 'accessKind: "release_package"', 'route: "/api/submissions/[id]/release-package"']));
  record("LOCAL-STORAGE-REGRESSION-019 release package route returns zip attachment without cache", includesAll(releasePackageRoute, ['"content-type": "application/zip"', '"content-disposition": `attachment;', '"cache-control": "private, no-store"']));

  record(
    "LOCAL-STORAGE-REGRESSION-020 public share package route is token scoped",
    includesAll(publicSharePackageRoute, [
      "getPublicShareAsync(token)",
      "recordPublicShareAccessAsync(publicShare.share.id",
      "{ status: 404 }"
    ])
  );
  record("LOCAL-STORAGE-REGRESSION-021 public share package route audits supplier package access", includesAll(publicSharePackageRoute, ['purpose: "supplier_share"', 'accessKind: "public_share_package"', "shareId: publicShare.share.id", "externalAccess: true"]));
  record("LOCAL-STORAGE-REGRESSION-022 public share package route returns zip attachment without cache", includesAll(publicSharePackageRoute, ['"content-type": "application/zip"', '"content-disposition": `attachment;', '"cache-control": "private, no-store"']));

  record("LOCAL-STORAGE-REGRESSION-023 cost report identifies missing local objects", includesAll(costReport, ["missingLocalObjectCount", "missingLocalObjects", "outside_local_root"]));
  record("LOCAL-STORAGE-REGRESSION-024 cost report identifies hash mismatches", includesAll(costReport, ["hashMismatchCount", "hashMismatchObjects", "expectedSha256"]));
  record("LOCAL-STORAGE-REGRESSION-025 cost report identifies orphan local files", includesAll(costReport, ["orphanLocalFileCount", "orphanLocalFiles", "referencedPaths"]));
  record("LOCAL-STORAGE-REGRESSION-026 cost report QC proves duplicate/missing/mismatch/orphan fixture", includesAll(costReportQc, ["duplicate hash group is reported", "missing local objects are reported", "hash mismatch objects are reported", "orphan local files are reported"]));

  record("LOCAL-STORAGE-REGRESSION-027 contract QC covers local provider server-stream mode", includesAll(contractQc, ["FILE-STORAGE-045 local provider download remains server-streamed", "FILE-STORAGE-060 submission file route distinguishes preview and download"]));
  record("LOCAL-STORAGE-REGRESSION-028 access audit QC covers runtime file route assertions", includesAll(accessAuditQc, ["FILE-006 file download writes StorageAccessed audit", "FILE-007 file preview writes StorageAccessed audit"]));
  record("LOCAL-STORAGE-REGRESSION-029 access audit QC covers runtime package/share assertions", includesAll(accessAuditQc, ["PKG-009 package download writes StorageAccessed audit", "SHARE-012 public package writes StorageAccessed audit"]));

  record("LOCAL-STORAGE-REGRESSION-030 qc:api asserts file download and PDF preview behavior", includesAll(apiQc, ["FILE-001 submission file download returns 200", "FILE-002 download uses attachment disposition", "FILE-003 PDF preview returns 200", "FILE-004 PDF preview content type is application/pdf", "FILE-005 PDF preview uses inline disposition"]));
  record("LOCAL-STORAGE-REGRESSION-031 qc:api asserts storage access audit provenance", includesAll(apiQc, ["FILE-011 file audits record QC runtime provenance", "PKG-013 package audit records QC runtime provenance", "SHARE-016 public package audit records QC runtime provenance"]));
  record("LOCAL-STORAGE-REGRESSION-032 qc:api asserts release package download behavior", includesAll(apiQc, ["PKG-004 package download returns 200", "PKG-005 package content type is zip", "PKG-006 package has zip signature", "PKG-007 package contains manifest"]));
  record("LOCAL-STORAGE-REGRESSION-033 qc:api asserts supplier share package boundary", includesAll(apiQc, ["SHARE-007 public share metadata is accessible without auth", "SHARE-010 public package download returns ZIP", "SHARE-017 manager revokes share", "SHARE-019 revoked public package download returns 404"]));
  record("LOCAL-STORAGE-REGRESSION-034 qc:api asserts procurement release payload is redacted", includesAll(apiQc, ["PROCAPI-001 unauthenticated procurement releases returns 401", "PROCAPI-002 Engineer procurement releases returns 403", "PROCAPI-003 Manager procurement releases returns 200", "!managerProcurementText.includes(\"local_path\")"]));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
