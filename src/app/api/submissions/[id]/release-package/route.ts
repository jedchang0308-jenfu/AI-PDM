import { NextResponse } from "next/server";
import { getSubmission } from "@/lib/db";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { contentDispositionFilename, readReleasePackage } from "@/lib/release-package-file";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission)) {
    return forbidden();
  }
  if (submission.status !== "Released" && submission.status !== "Obsolete") {
    return NextResponse.json({ error: "只有已發布或已廢止送審資料可以下載發布包" }, { status: 409 });
  }
  if (!submission.release_package) {
    return NextResponse.json({ error: "此送審資料尚未產生發布包" }, { status: 404 });
  }

  try {
    const bytes = await readReleasePackage(submission.release_package);
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
      return NextResponse.json({ error: "儲存的發布包路徑超出發布包資料夾" }, { status: 500 });
    }
    return NextResponse.json({ error: "儲存的發布包遺失" }, { status: 404 });
  }
}
