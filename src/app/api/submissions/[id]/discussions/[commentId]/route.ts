import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getDiscussionComment, getSubmission, resolveDiscussionComment } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id, commentId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getDiscussionComment({ submissionId: id, commentId });
  if (!existing) {
    return NextResponse.json({ error: "找不到討論留言" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "目前僅支援結案留言" }, { status: 400 });
  }

  return NextResponse.json({
    comment: resolveDiscussionComment({ submissionId: id, commentId, resolvedBy: auth.user.id })
  });
}
