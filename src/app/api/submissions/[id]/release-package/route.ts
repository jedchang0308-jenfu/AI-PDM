import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { createReleasePackageStorageService } from "@/lib/file-storage";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { contentDispositionFilename, getReleasePackageStorageKey, readReleasePackage } from "@/lib/release-package-file";
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from "@/lib/storage-access-audit";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "Release package not found" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) {
    return forbidden();
  }
  if (submission.status !== "Released" && submission.status !== "Obsolete") {
    return NextResponse.json({ error: "Only Released or Obsolete submissions can download release packages" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "Release package not found" }, { status: 404 });
  }

  try {
    const storageKey = getReleasePackageStorageKey(submission.release_package);
    const bytes = await readReleasePackage(submission.release_package);
    const access = await createReleasePackageStorageService().createDownloadUrl({
      key: storageKey,
      filename: submission.release_package.package_filename,
      forceDownload: true,
      purpose: "release_package"
    });
    await auditStorageAccess({
      actorId: auth.user.id,
      submissionId: id,
      accessKind: "release_package",
      fileId: submission.release_package.id,
      filename: submission.release_package.package_filename,
      bytes: bytes.byteLength,
      disposition: "attachment",
      provider: access.provider,
      storageKey,
      bucket: access.bucket ?? null,
      access,
      route: "/api/submissions/[id]/release-package",
      provenance: resolveStorageAccessAuditProvenance(request.headers)
    });

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.byteLength),
        "content-disposition": `attachment; filename="${contentDispositionFilename(submission.release_package.package_filename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RELEASE_PACKAGE_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "?脣??撣?頝臬?頞?澆????冗" }, { status: 500 });
    }
    return NextResponse.json({ error: "Release package not found" }, { status: 404 });
  }
}

