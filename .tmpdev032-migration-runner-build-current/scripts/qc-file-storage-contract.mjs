#!/usr/bin/env node

import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

try {
  const storage = readProjectFile(root, "src/lib/file-storage.ts");
  const fileStore = readProjectFile(root, "src/lib/file-store.ts");
  const fileResponse = readProjectFile(root, "src/lib/file-response.ts");
  const releasePackageFile = readProjectFile(root, "src/lib/release-package-file.ts");
  const storageAccessAudit = readProjectFile(root, "src/lib/storage-access-audit.ts");
  const submissionFileRoute = readProjectFile(root, "src/app/api/submissions/[id]/files/[...filePath]/route.ts");
  const releasePackageRoute = readProjectFile(root, "src/app/api/submissions/[id]/release-package/route.ts");
  const publicSharePackageRoute = readProjectFile(root, "src/app/api/public/shares/[token]/package/route.ts");
  const releasePackage = readProjectFile(root, "src/lib/release-package.ts");
  const releasePackageAsync = readProjectFile(root, "src/lib/release-package-async.ts");
  const masterAttachmentRepository = readProjectFile(root, "src/lib/repositories/master-attachment-repository.ts");

  record("FILE-STORAGE-001 service interface exists", storage.includes("export interface FileStorageService"));
  record("FILE-STORAGE-002 local adapter exists", storage.includes("export class LocalRepositoryStorageAdapter"));
  record("FILE-STORAGE-003 adapter constrains repository boundary", storage.includes("resolves outside repository root"));
  record("FILE-STORAGE-004 adapter exposes putObject", storage.includes("putObject(input: PutObjectInput)"));
  record("FILE-STORAGE-005 adapter exposes readObject", storage.includes("readObject(key: string)"));
  record("FILE-STORAGE-006 adapter exposes deleteObject", storage.includes("deleteObject(key: string)"));
  record("FILE-STORAGE-007 adapter exposes hash verification", storage.includes("verifyObjectHash"));
  record("FILE-STORAGE-008 file-store uses storage service", fileStore.includes("createFileStorageService"));
  record("FILE-STORAGE-009 file-store builds provider-neutral key", fileStore.includes("buildStorageKey"));
  record("FILE-STORAGE-010 file-store no longer imports crypto directly", !fileStore.includes('from "node:crypto"'));
  record("FILE-STORAGE-011 file-store no longer writes upload bytes directly", !fileStore.includes("fs.writeFile(localPath"));
  record("FILE-STORAGE-012 provider registry keeps local provider", storage.includes('"local_repository"'));
  record("FILE-STORAGE-013 local path to key bridge exists", storage.includes("storageKeyFromLocalPath"));
  record("FILE-STORAGE-014 file-response reads through provider-aware storage service", fileResponse.includes("createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key)"));
  record("FILE-STORAGE-015 file-response does not import fs", !fileResponse.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-016 release-package reads files through provider-aware storage service", releasePackage.includes("createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key)"));
  record("FILE-STORAGE-017 release-package-async reads files through provider-aware storage service", releasePackageAsync.includes("createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key)"));
  record("FILE-STORAGE-018 release package paths use storage pointer bridge", releasePackage.includes("storagePointerFromRecord") && releasePackageAsync.includes("storagePointerFromRecord"));
  record("FILE-STORAGE-019 release packages no longer import crypto directly", !releasePackage.includes('from "node:crypto"') && !releasePackageAsync.includes('from "node:crypto"'));
  record("FILE-STORAGE-020 release package storage root factory exists", storage.includes("createReleasePackageStorageService") && storage.includes("getReleasePackageRoot"));
  record("FILE-STORAGE-021 release package writer uses release storage service", releasePackage.includes("createReleasePackageStorageService") && releasePackage.includes("packageStorage.putObject"));
  record("FILE-STORAGE-022 release-package-async writer uses release storage service", releasePackageAsync.includes("createReleasePackageStorageService") && releasePackageAsync.includes("packageStorage.putObject"));
  record("FILE-STORAGE-023 release package writer no longer writes zip bytes directly", !releasePackage.includes("fs.writeFile(packagePath") && !releasePackageAsync.includes("fs.writeFile(packagePath"));
  record("FILE-STORAGE-024 release-package-file reads zip through record-aware storage service", releasePackageFile.includes("readReleasePackage") && releasePackageFile.includes("createFileStorageServiceForPointer(pointer).readObject(pointer.key)"));
  record("FILE-STORAGE-025 release-package-file does not import fs", !releasePackageFile.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-026 master attachment saves through storage service", masterAttachmentRepository.includes("createFileStorageService().putObject") && masterAttachmentRepository.includes("buildStorageKey"));
  record("FILE-STORAGE-027 master attachment reads through provider-aware storage service", masterAttachmentRepository.includes("createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key)") && masterAttachmentRepository.includes("storagePointerFromRecord(row)"));
  record("FILE-STORAGE-028 master attachment no longer imports fs", !masterAttachmentRepository.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-029 master attachment uses shared sha256 helper", masterAttachmentRepository.includes("sha256(fileBuffer)") && !masterAttachmentRepository.includes("crypto.createHash"));
  record("FILE-STORAGE-030 provider registry retains historical Supabase pointer identity", storage.includes('"supabase_storage"'));
  record("FILE-STORAGE-031 historical Supabase adapter is permanently retired", storage.includes("export class RetiredSupabaseStorageAdapter implements FileStorageService"));
  record("FILE-STORAGE-032 configured factory exists", storage.includes("createConfiguredFileStorageService"));
  record("FILE-STORAGE-033 default factory delegates configured provider", storage.includes("export function createFileStorageService(): FileStorageService {\n  return createConfiguredFileStorageService();\n}"));
  record("FILE-STORAGE-034 provider resolver defaults to local", storage.includes('env.PDM_STORAGE_PROVIDER?.trim() || "local_repository"'));
  record("FILE-STORAGE-035 Supabase credential configuration is absent", !storage.includes("PDM_SUPABASE") && !storage.includes("serviceRoleKey"));
  record("FILE-STORAGE-036 configured Supabase provider fails closed toward GCS", storage.includes("SUPABASE_STORAGE_RETIRED_USE_GCS:configured_provider"));
  record("FILE-STORAGE-037 historical Supabase pointer adapter has no live gate", !storage.includes("SUPABASE_STORAGE_LIVE_ENABLED") && !storage.includes("export class SupabaseStorageAdapter"));
  record("FILE-STORAGE-038 historical Supabase object operations share a retired error", storage.includes("SUPABASE_STORAGE_RETIRED_USE_GCS:${operation}"));
  record("FILE-STORAGE-039 Supabase Storage HTTP endpoint is absent", !storage.includes("/storage/v1/"));
  record("FILE-STORAGE-040 Supabase credential headers are absent", !storage.includes("apikey: this.config") && !storage.includes("Bearer ${this.config.serviceRoleKey}"));
  record("FILE-STORAGE-041 historical Supabase object pointers stay parseable", storage.includes('pointer.startsWith("supabase://")') && storage.includes('parseProviderPointer(pointer, "supabase://")'));
  record("FILE-STORAGE-041G provider-aware pointer service exists", storage.includes("createFileStorageServiceForPointer") && storage.includes("storagePointerFromRecord"));
  record("FILE-STORAGE-041A provider registry includes S3-compatible Storage", storage.includes('"s3_compatible"'));
  record("FILE-STORAGE-041B S3-compatible adapter exists", storage.includes("export class S3CompatibleStorageAdapter implements FileStorageService"));
  record("FILE-STORAGE-041C S3-compatible config uses server-only env names", storage.includes("PDM_S3_COMPATIBLE_ENDPOINT") && storage.includes("PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY"));
  record("FILE-STORAGE-041D S3-compatible public credential env is rejected", storage.includes("NEXT_PUBLIC_S3_COMPATIBLE_SECRET_ACCESS_KEY") && storage.includes("S3-compatible credentials must never be exposed"));
  record("FILE-STORAGE-041E S3-compatible live IO is disabled by default", storage.includes('PDM_S3_COMPATIBLE_LIVE_ENABLED === "1"') && storage.includes("signed request staging gate"));
  record("FILE-STORAGE-041F S3-compatible object pointers stay provider-scoped", storage.includes("s3-compatible://${this.config.bucket}/${normalizeStorageKey(key)}"));
  record("FILE-STORAGE-042 storage keys are normalized before provider use", storage.includes("normalizeStorageKey"));
  record("FILE-STORAGE-043 download URL contract exists", storage.includes("CreateDownloadUrlInput") && storage.includes("DownloadUrl"));
  record("FILE-STORAGE-044 service interface exposes createDownloadUrl", storage.includes("createDownloadUrl(input: CreateDownloadUrlInput): Promise<DownloadUrl>"));
  record("FILE-STORAGE-045 local provider download remains server-streamed", storage.includes('mode: "server_stream"') && storage.includes("url: null"));
  record("FILE-STORAGE-046 download access always requires audit", storage.includes("auditRequired: true"));
  record("FILE-STORAGE-047 provider registry includes Google Cloud Storage", storage.includes('"google_cloud_storage"'));
  record("FILE-STORAGE-048 Google Cloud Storage adapter exists", storage.includes("export class GoogleCloudStorageDisabledAdapter implements FileStorageService"));
  record("FILE-STORAGE-049 GCS config uses server-only env names", storage.includes("PDM_GCS_PROJECT_ID") && storage.includes("PDM_GCS_BUCKET"));
  record("FILE-STORAGE-050 GCS public configuration is rejected", storage.includes("NEXT_PUBLIC_GCS_BUCKET") && storage.includes("must never be exposed"));
  record("FILE-STORAGE-051 release package uses the GCS bucket override", storage.includes("PDM_GCS_RELEASE_PACKAGE_BUCKET"));
  record("FILE-STORAGE-052 historical Supabase pointer service cannot issue signed URLs", storage.includes('return this.unavailable("createDownloadUrl")'));
  record("FILE-STORAGE-053 storage access audit helper exists", storageAccessAudit.includes("export async function auditStorageAccess"));
  record("FILE-STORAGE-054 storage access audit writes audit logs", storageAccessAudit.includes("createAuditLogAsync") && storageAccessAudit.includes('action: "StorageAccessed"'));
  record("FILE-STORAGE-055 storage access audit records provider and key", storageAccessAudit.includes("provider: input.provider") && storageAccessAudit.includes("storageKey: input.storageKey"));
  record("FILE-STORAGE-056 storage access audit records access mode and TTL", storageAccessAudit.includes("accessMode: input.access.mode") && storageAccessAudit.includes("signedUrlExpiresAt: input.access.expiresAt"));
  record("FILE-STORAGE-057 storage access audit omits signed URL values", !storageAccessAudit.includes("input.access.url"));
  record("FILE-STORAGE-058 submission file route audits storage access", submissionFileRoute.includes("auditStorageAccess") && submissionFileRoute.includes('route: "/api/submissions/[id]/files/[...filePath]"'));
  record("FILE-STORAGE-059 submission file route creates download access contract", submissionFileRoute.includes("createFileStorageServiceForPointer(result.storagePointer).createDownloadUrl"));
  record("FILE-STORAGE-060 submission file route distinguishes preview and download", submissionFileRoute.includes('"submission_file_preview"') && submissionFileRoute.includes('"submission_file"'));
  record("FILE-STORAGE-061 submission file route audits storage key", submissionFileRoute.includes("storageKey: result.storageKey"));
  record("FILE-STORAGE-062 release package storage key helper exists", releasePackageFile.includes("export function getReleasePackageStorageKey"));
  record("FILE-STORAGE-063 release package route audits storage access", releasePackageRoute.includes("auditStorageAccess") && releasePackageRoute.includes('route: "/api/submissions/[id]/release-package"'));
  record("FILE-STORAGE-064 release package route creates download access contract", releasePackageRoute.includes("createReleasePackageStorageServiceForRecord(submission.release_package).createDownloadUrl"));
  record("FILE-STORAGE-065 release package route audits release package kind", releasePackageRoute.includes('accessKind: "release_package"'));
  record("FILE-STORAGE-066 release package route audits storage key", releasePackageRoute.includes("getReleasePackageStorageKey") && releasePackageRoute.includes("storageKey,"));
  record("FILE-STORAGE-067 storage access audit supports public share package kind", storageAccessAudit.includes('"public_share_package"'));
  record("FILE-STORAGE-068 storage access audit records share scope", storageAccessAudit.includes("shareId: input.shareId ?? null") && storageAccessAudit.includes("externalAccess: input.externalAccess ?? false"));
  record("FILE-STORAGE-069 storage access audit allows anonymous external actor", storageAccessAudit.includes("actorId?: string | null"));
  record("FILE-STORAGE-070 public share package route audits storage access", publicSharePackageRoute.includes("auditStorageAccess") && publicSharePackageRoute.includes('route: "/api/public/shares/[token]/package"'));
  record("FILE-STORAGE-071 public share package route creates download access contract", publicSharePackageRoute.includes("createReleasePackageStorageServiceForRecord(publicShare.submission.release_package).createDownloadUrl"));
  record("FILE-STORAGE-072 public share package route uses supplier share purpose", publicSharePackageRoute.includes('purpose: "supplier_share"'));
  record("FILE-STORAGE-073 public share package route audits external access", publicSharePackageRoute.includes("externalAccess: true") && publicSharePackageRoute.includes('accessKind: "public_share_package"'));
  record("FILE-STORAGE-074 public share package route audits share id without raw token", publicSharePackageRoute.includes("shareId: publicShare.share.id") && !storageAccessAudit.includes("token") && !publicSharePackageRoute.includes("tokenHash"));
  record("FILE-STORAGE-075 public share package route audits storage key", publicSharePackageRoute.includes("getReleasePackageStorageKey") && publicSharePackageRoute.includes("storageKey,"));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
