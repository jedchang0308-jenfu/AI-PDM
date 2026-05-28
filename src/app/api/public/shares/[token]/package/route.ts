import { NextResponse } from "next/server";
import { getPublicShare, recordPublicShareAccess } from "@/lib/readonly-share";
import { contentDispositionFilename, readReleasePackage } from "@/lib/release-package-file";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publicShare = getPublicShare(token);
  if (!publicShare || !publicShare.submission.release_package) {
    return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });
  }

  try {
    const bytes = await readReleasePackage(publicShare.submission.release_package);
    recordPublicShareAccess(publicShare.share.id, publicShare.submission.id);
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
