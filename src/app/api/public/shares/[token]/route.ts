import { NextResponse } from "next/server";
import { serializePublicShareAsync } from "@/lib/readonly-share-async";
import { getAuthorizedPublicShareInSnapshot, withPrincipalSharePermission } from "@/lib/principal-readonly-share";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return withPrincipalSharePermission(request, "src/app/api/public/shares/[token]/route.ts", "submission.view",
    async ({ snapshot, verified }) => {
      const publicShare = await getAuthorizedPublicShareInSnapshot(snapshot, verified, token);
      if (publicShare instanceof Response) return publicShare;
      return NextResponse.json({
        share: {
          id: publicShare.share.id,
          label: publicShare.share.label,
          expires_at: publicShare.share.expires_at,
          created_at: publicShare.share.created_at
        },
        ...(await serializePublicShareAsync(publicShare.submission, token, publicShare.share.id, snapshot))
      }, { headers: { "cache-control": "private, no-store" } });
    }, { readOnly: false });
}
