import { createHash } from "node:crypto";
import type { ReleasePackage } from "@/lib/types";
import {
  contentDispositionFilename,
  createReleasePackageStorageServiceForRecord,
  getReleasePackageStorageKey,
  readReleasePackage
} from "@/lib/release-package-file";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";
import type { StorageAccessKind } from "@/lib/storage-access-audit";

export type AuthorizedReleasePackage = {
  submissionId?: string;
  releasePackage: ReleasePackage;
  principalId: string;
  profileId: string;
  companyId: string;
  shareId?: string;
  accessKind?: StorageAccessKind;
  externalAccess?: boolean;
};

/** One audited delivery path for submission, handoff and procurement reads. */
export async function deliverPrincipalReleasePackage(
  request: Request, submissionId: string, route: string, authorized: AuthorizedReleasePackage
): Promise<Response> {
  submissionId = authorized.submissionId ?? submissionId;
  const storageKey = getReleasePackageStorageKey(authorized.releasePackage);
  const bytes = await readReleasePackage(authorized.releasePackage);
  if (bytes.byteLength !== Number(authorized.releasePackage.file_size) ||
      !/^[0-9a-f]{64}$/i.test(authorized.releasePackage.sha256) ||
      createHash("sha256").update(bytes).digest("hex") !== authorized.releasePackage.sha256.toLowerCase()) {
    return Response.json({ code: "stored_file_integrity_mismatch" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const access = await createReleasePackageStorageServiceForRecord(authorized.releasePackage)
    .createDownloadUrl({ key: storageKey, filename: authorized.releasePackage.package_filename,
      forceDownload: true, purpose: "release_package" });
  await auditStorageAccess({
    principalId: authorized.principalId, historicalProfileId: authorized.profileId,
    companyId: authorized.companyId, submissionId, accessKind: authorized.accessKind ?? "release_package",
    shareId: authorized.shareId,
    fileId: authorized.releasePackage.id, filename: authorized.releasePackage.package_filename,
    bytes: bytes.byteLength, disposition: "attachment", provider: access.provider,
    storageKey, bucket: access.bucket ?? null, access,
    route, externalAccess: authorized.externalAccess ?? false,
    provenance: resolveStorageAccessAuditProvenance(request.headers)
  });
  return new Response(new Uint8Array(bytes), { headers: {
    "content-type": "application/zip", "content-length": String(bytes.byteLength),
    "content-disposition": 'attachment; filename="' +
      contentDispositionFilename(authorized.releasePackage.package_filename) + '"',
    "x-content-type-options": "nosniff", "cache-control": "private, no-store"
  } });
}
