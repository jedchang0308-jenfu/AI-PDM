import { NextResponse } from "next/server";
import { getPublicShare, recordPublicShareAccess, serializePublicShare } from "@/lib/readonly-share";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publicShare = getPublicShare(token);
  if (!publicShare) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });

  recordPublicShareAccess(publicShare.share.id, publicShare.submission.id);
  return NextResponse.json({
    share: {
      id: publicShare.share.id,
      label: publicShare.share.label,
      expires_at: publicShare.share.expires_at,
      created_at: publicShare.share.created_at
    },
    ...serializePublicShare(publicShare.submission, publicShare.token, publicShare.share.id)
  });
}
