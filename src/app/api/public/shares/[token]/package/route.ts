import { NextResponse } from "next/server";
import { getAuthorizedPublicShareInSnapshot, withPrincipalSharePermission } from "@/lib/principal-readonly-share";
import { deliverPrincipalReleasePackage } from "@/lib/principal-release-package-delivery";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const authorized = await withPrincipalSharePermission(request,
    "src/app/api/public/shares/[token]/package/route.ts", "submission.view", async ({ snapshot, verified }) => {
      const publicShare = await getAuthorizedPublicShareInSnapshot(snapshot, verified, token);
      if (publicShare instanceof Response) return publicShare;
      return {
        submissionId: publicShare.submission.id,
        releasePackage: publicShare.submission.release_package!,
        principalId: verified.session.principalId,
        profileId: verified.profile.pdmUserId,
        companyId: verified.profile.companyId,
        shareId: publicShare.share.id,
        accessKind: "public_share_package" as const,
        externalAccess: true
      };
    }, { readOnly: false });
  if (authorized instanceof Response) return authorized;
  try {
    return await deliverPrincipalReleasePackage(request, authorized.submissionId ?? "",
      "/api/public/shares/[token]/package", authorized);
  } catch (error) {
    if (error instanceof Error && error.message === "RELEASE_PACKAGE_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "儲存的發布包路徑超出發布包資料夾" }, { status: 500 });
    }
    return NextResponse.json({ error: "儲存的發布包遺失" }, { status: 404 });
  }
}
