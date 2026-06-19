import { NextResponse } from "next/server";
import { createReleasePackageStorageService } from "@/lib/file-storage";
import { getPublicShareAsync, recordPublicShareAccessAsync } from "@/lib/readonly-share-async";
import { contentDispositionFilename, getReleasePackageStorageKey, readReleasePackage } from "@/lib/release-package-file";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publicShare = await getPublicShareAsync(token);
  if (!publicShare || !publicShare.submission.release_package) {
    return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });
  }

  try {
    const storageKey = getReleasePackageStorageKey(publicShare.submission.release_package);
    const bytes = await readReleasePackage(publicShare.submission.release_package);
    const access = await createReleasePackageStorageService().createDownloadUrl({
      key: storageKey,
      filename: publicShare.submission.release_package.package_filename,
      forceDownload: true,
      purpose: "supplier_share"
    });
    await auditStorageAccess({
      actorId: null,
      submissionId: publicShare.submission.id,
      accessKind: "public_share_package",
      fileId: publicShare.submission.release_package.id,
      shareId: publicShare.share.id,
      filename: publicShare.submission.release_package.package_filename,
      bytes: bytes.byteLength,
      disposition: "attachment",
      provider: access.provider,
      storageKey,
      bucket: access.bucket ?? null,
      access,
      route: "/api/public/shares/[token]/package",
      externalAccess: true,
      provenance: resolveStorageAccessAuditProvenance(request.headers)
    });
    await recordPublicShareAccessAsync(publicShare.share.id, publicShare.submission.id);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename="${contentDispositionFilename(publicShare.submission.release_package.package_filename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RELEASE_PACKAGE_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "儲存的發布包路徑超出發布包資料夾" }, { status: 500 });
    }
    return NextResponse.json({ error: "儲存的發布包遺失" }, { status: 404 });
  }
}
