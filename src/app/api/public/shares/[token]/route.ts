import { NextResponse } from "next/server";
import { serializePublicShareAsync } from "@/lib/readonly-share-async";
import { getAuthorizedPublicShareInSnapshot, withPrincipalSharePermission } from "@/lib/principal-readonly-share";
import { deliverPrincipalSharePreview, resolvePrincipalSharePreviewInSnapshot } from "@/lib/principal-share-preview";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const previewFileId = new URL(request.url).searchParams.get('previewFileId');
  if (previewFileId !== null) {
    return deliverPrincipalSharePreview(request, () => withPrincipalSharePermission(request,
      "src/app/api/public/shares/[token]/route.ts", "submission.view", async ({ snapshot, verified }) => {
        const publicShare = await getAuthorizedPublicShareInSnapshot(snapshot, verified, token);
        return publicShare instanceof Response ? publicShare
          : resolvePrincipalSharePreviewInSnapshot(snapshot, verified, publicShare, previewFileId);
      }, { readOnly: false }));
  }
  return withPrincipalSharePermission(request, "src/app/api/public/shares/[token]/route.ts", "submission.view",
    async ({ snapshot, verified }) => {
      const publicShare = await getAuthorizedPublicShareInSnapshot(snapshot, verified, token);
      if (publicShare instanceof Response) return publicShare;
      const previewFileIds: string[] = [];
      for (const file of publicShare.submission.files) {
        const preview = await resolvePrincipalSharePreviewInSnapshot(snapshot, verified, publicShare, file.id);
        if (!(preview instanceof Response)) previewFileIds.push(file.id);
      }
      return NextResponse.json({
        share: {
          id: publicShare.share.id,
          label: publicShare.share.label,
          expires_at: publicShare.share.expires_at,
          created_at: publicShare.share.created_at
        },
        ...(await (publicShare.externalProjectContext
          ? serializePublicShareAsync(publicShare.submission, token, publicShare.share.id, snapshot, false, previewFileIds)
          : serializePublicShareAsync(publicShare.submission, token, publicShare.share.id, snapshot, true, previewFileIds)))
      }, { headers: { "cache-control": "private, no-store" } });
    }, { readOnly: false });
}
