import { NextResponse } from "next/server";
import {
  getPublicShareAsync,
  recordPublicShareAccessAsync,
  serializePublicShareAsync
} from "@/lib/readonly-share-async";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const publicShare = await getPublicShareAsync(token);
  if (!publicShare) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });

  await recordPublicShareAccessAsync(publicShare.share.id, publicShare.submission.id);
  return NextResponse.json({
    share: {
      id: publicShare.share.id,
      label: publicShare.share.label,
      expires_at: publicShare.share.expires_at,
      created_at: publicShare.share.created_at
    },
    ...(await serializePublicShareAsync(publicShare.submission, publicShare.token, publicShare.share.id))
  });
}
