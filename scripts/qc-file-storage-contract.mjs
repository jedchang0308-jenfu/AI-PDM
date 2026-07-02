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
  record("FILE-STORAGE-014 file-response reads through storage service", fileResponse.includes("createFileStorageService().readObject(storageKey)"));
  record("FILE-STORAGE-015 file-response does not import fs", !fileResponse.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-016 release-package reads files through storage service", releasePackage.includes("storage.readObject(storageKey)"));
  record("FILE-STORAGE-017 release-package-async reads files through storage service", releasePackageAsync.includes("storage.readObject(storageKey)"));
  record("FILE-STORAGE-018 release package paths use local path bridge", releasePackage.includes("storageKeyFromLocalPath") && releasePackageAsync.includes("storageKeyFromLocalPath"));
  record("FILE-STORAGE-019 release packages no longer import crypto directly", !releasePackage.includes('from "node:crypto"') && !releasePackageAsync.includes('from "node:crypto"'));
  record("FILE-STORAGE-020 release package storage root factory exists", storage.includes("createReleasePackageStorageService") && storage.includes("getReleasePackageRoot"));
  record("FILE-STORAGE-021 release package writer uses release storage service", releasePackage.includes("createReleasePackageStorageService") && releasePackage.includes("packageStorage.putObject"));
  record("FILE-STORAGE-022 release-package-async writer uses release storage service", releasePackageAsync.includes("createReleasePackageStorageService") && releasePackageAsync.includes("packageStorage.putObject"));
  record("FILE-STORAGE-023 release package writer no longer writes zip bytes directly", !releasePackage.includes("fs.writeFile(packagePath") && !releasePackageAsync.includes("fs.writeFile(packagePath"));
  record("FILE-STORAGE-024 release-package-file reads zip through storage service", releasePackageFile.includes("createReleasePackageStorageService().readObject(storageKey)"));
  record("FILE-STORAGE-025 release-package-file does not import fs", !releasePackageFile.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-026 master attachment saves through storage service", masterAttachmentRepository.includes("createFileStorageService().putObject") && masterAttachmentRepository.includes("buildStorageKey"));
  record("FILE-STORAGE-027 master attachment reads through storage service", masterAttachmentRepository.includes("storage.readObject(storageKey)") && masterAttachmentRepository.includes("storageKeyFromLocalPath"));
  record("FILE-STORAGE-028 master attachment no longer imports fs", !masterAttachmentRepository.includes('from "node:fs/promises"'));
  record("FILE-STORAGE-029 master attachment uses shared sha256 helper", masterAttachmentRepository.includes("sha256(fileBuffer)") && !masterAttachmentRepository.includes("crypto.createHash"));
  record("FILE-STORAGE-030 provider registry includes Supabase Storage", storage.includes('"supabase_storage"'));
  record("FILE-STORAGE-031 Supabase adapter exists", storage.includes("export class SupabaseStorageAdapter implements FileStorageService"));
  record("FILE-STORAGE-032 configured factory exists", storage.includes("createConfiguredFileStorageService"));
  record("FILE-STORAGE-033 default factory remains local", storage.includes("export function createFileStorageService(): FileStorageService {\n  return new LocalRepositoryStorageAdapter();\n}"));
  record("FILE-STORAGE-034 provider resolver defaults to local", storage.includes('env.PDM_STORAGE_PROVIDER?.trim() || "local_repository"'));
  record("FILE-STORAGE-035 Supabase config uses server-only env names", storage.includes("PDM_SUPABASE_URL") && storage.includes("PDM_SUPABASE_SERVICE_ROLE_KEY"));
  record("FILE-STORAGE-036 Supabase service role public env is rejected", storage.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY") && storage.includes("must never be exposed"));
  record("FILE-STORAGE-037 Supabase live IO is disabled by default", storage.includes('PDM_SUPABASE_STORAGE_LIVE_ENABLED === "1"') && storage.includes("assertLiveEnabled"));
  record("FILE-STORAGE-038 Supabase delete is fail-closed", storage.includes("Supabase Storage delete is disabled"));
  record("FILE-STORAGE-039 Supabase reads private authenticated objects", storage.includes("object/authenticated/"));
  record("FILE-STORAGE-040 Supabase uploads use non-upsert writes", storage.includes('"x-upsert": "false"'));
  record("FILE-STORAGE-041 Supabase object pointers stay provider-scoped", storage.includes("supabase://${this.config.bucket}/${key}"));
  record("FILE-STORAGE-041A provider registry includes S3-compatible Storage", storage.includes('"s3_compatible"'));
  record("FILE-STORAGE-041B S3-compatible adapter exists", storage.includes("export class S3CompatibleStorageAdapter implements FileStorageService"));
  record("FILE-STORAGE-041C S3-compatible config uses server-only env names", storage.includes("PDM_S3_COMPATIBLE_ENDPOINT") && storage.includes("PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY"));
  record("FILE-STORAGE-041D S3-compatible public credential env is rejected", storage.includes("NEXT_PUBLIC_S3_COMPATIBLE_SECRET_ACCESS_KEY") && storage.includes("S3-compatible credentials must never be exposed"));
  record("FILE-STORAGE-041E S3-compatible live IO is disabled by default", storage.includes('PDM_S3_COMPATIBLE_LIVE_ENABLED === "1"') && storage.includes("signed request staging gate"));
  record("FILE-STORAGE-041F S3-compatible object pointers stay provider-scoped", storage.includes("s3-compatible://${this.config.bucket}/${normalizeStorageKey(key)}"));
  record("FILE-STORAGE-042 storage keys are URL encoded per path segment", storage.includes("encodeStorageKey") && storage.includes("map(encodeURIComponent)"));
  record("FILE-STORAGE-043 download URL contract exists", storage.includes("CreateDownloadUrlInput") && storage.includes("DownloadUrl"));
  record("FILE-STORAGE-044 service interface exposes createDownloadUrl", storage.includes("createDownloadUrl(input: CreateDownloadUrlInput): Promise<DownloadUrl>"));
  record("FILE-STORAGE-045 local provider download remains server-streamed", storage.includes('mode: "server_stream"') && storage.includes("url: null"));
  record("FILE-STORAGE-046 download access always requires audit", storage.includes("auditRequired: true"));
  record("FILE-STORAGE-047 Supabase provider creates signed URLs", storage.includes("object/sign/") && storage.includes('mode: "signed_url"'));
  record("FILE-STORAGE-048 Supabase signed URLs do not require browser authorization headers", storage.includes("authorizationHeaderRequired: false"));
  record("FILE-STORAGE-049 Supabase signed URL TTL env defaults exist", storage.includes("PDM_SUPABASE_SIGNED_URL_TTL_SECONDS") && storage.includes("PDM_SUPABASE_SIGNED_URL_MAX_TTL_SECONDS"));
  record("FILE-STORAGE-050 Supabase signed URL TTL is clamped", storage.includes("resolveDownloadUrlTtlSeconds") && storage.includes("Math.min(ttl, config.signedUrlMaxTtlSeconds)"));
  record("FILE-STORAGE-051 signed URL download flag is explicit", storage.includes("input.forceDownload") && storage.includes("download: input.filename ?? true"));
  record("FILE-STORAGE-052 signed URL response accepts current Supabase casing", storage.includes("signedURL?: string") && storage.includes("signedUrl?: string"));
  record("FILE-STORAGE-053 storage access audit helper exists", storageAccessAudit.includes("export async function auditStorageAccess"));
  record("FILE-STORAGE-054 storage access audit writes audit logs", storageAccessAudit.includes("createAuditLogAsync") && storageAccessAudit.includes('action: "StorageAccessed"'));
  record("FILE-STORAGE-055 storage access audit records provider and key", storageAccessAudit.includes("provider: input.provider") && storageAccessAudit.includes("storageKey: input.storageKey"));
  record("FILE-STORAGE-056 storage access audit records access mode and TTL", storageAccessAudit.includes("accessMode: input.access.mode") && storageAccessAudit.includes("signedUrlExpiresAt: input.access.expiresAt"));
  record("FILE-STORAGE-057 storage access audit omits signed URL values", !storageAccessAudit.includes("input.access.url"));
  record("FILE-STORAGE-058 submission file route audits storage access", submissionFileRoute.includes("auditStorageAccess") && submissionFileRoute.includes('route: "/api/submissions/[id]/files/[...filePath]"'));
  record("FILE-STORAGE-059 submission file route creates download access contract", submissionFileRoute.includes("createFileStorageService().createDownloadUrl"));
  record("FILE-STORAGE-060 submission file route distinguishes preview and download", submissionFileRoute.includes('"submission_file_preview"') && submissionFileRoute.includes('"submission_file"'));
  record("FILE-STORAGE-061 submission file route audits storage key", submissionFileRoute.includes("storageKey: result.storageKey"));
  record("FILE-STORAGE-062 release package storage key helper exists", releasePackageFile.includes("export function getReleasePackageStorageKey"));
  record("FILE-STORAGE-063 release package route audits storage access", releasePackageRoute.includes("auditStorageAccess") && releasePackageRoute.includes('route: "/api/submissions/[id]/release-package"'));
  record("FILE-STORAGE-064 release package route creates download access contract", releasePackageRoute.includes("createReleasePackageStorageService().createDownloadUrl"));
  record("FILE-STORAGE-065 release package route audits release package kind", releasePackageRoute.includes('accessKind: "release_package"'));
  record("FILE-STORAGE-066 release package route audits storage key", releasePackageRoute.includes("getReleasePackageStorageKey") && releasePackageRoute.includes("storageKey,"));
  record("FILE-STORAGE-067 storage access audit supports public share package kind", storageAccessAudit.includes('"public_share_package"'));
  record("FILE-STORAGE-068 storage access audit records share scope", storageAccessAudit.includes("shareId: input.shareId ?? null") && storageAccessAudit.includes("externalAccess: input.externalAccess ?? false"));
  record("FILE-STORAGE-069 storage access audit allows anonymous external actor", storageAccessAudit.includes("actorId?: string | null"));
  record("FILE-STORAGE-070 public share package route audits storage access", publicSharePackageRoute.includes("auditStorageAccess") && publicSharePackageRoute.includes('route: "/api/public/shares/[token]/package"'));
  record("FILE-STORAGE-071 public share package route creates download access contract", publicSharePackageRoute.includes("createReleasePackageStorageService().createDownloadUrl"));
  record("FILE-STORAGE-072 public share package route uses supplier share purpose", publicSharePackageRoute.includes('purpose: "supplier_share"'));
  record("FILE-STORAGE-073 public share package route audits external access", publicSharePackageRoute.includes("externalAccess: true") && publicSharePackageRoute.includes('accessKind: "public_share_package"'));
  record("FILE-STORAGE-074 public share package route audits share id without raw token", publicSharePackageRoute.includes("shareId: publicShare.share.id") && !storageAccessAudit.includes("token") && !publicSharePackageRoute.includes("tokenHash"));
  record("FILE-STORAGE-075 public share package route audits storage key", publicSharePackageRoute.includes("getReleasePackageStorageKey") && publicSharePackageRoute.includes("storageKey,"));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
