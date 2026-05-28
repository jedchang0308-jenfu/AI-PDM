import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createDiscussionComment, getSubmission, getSubmissionFile, listDiscussionComments } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({
    submissionId: id,
    comments: listDiscussionComments(id)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const text = String(body.body ?? body.comment ?? "").trim();
  if (text.length < 2) {
    return NextResponse.json({ error: "留言內容為必填" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "comment body is too long" }, { status: 400 });
  }

  const fileId = String(body.fileId ?? body.file_id ?? "").trim() || null;
  if (fileId && !getSubmissionFile({ submissionId: id, fileId })) {
    return NextResponse.json({ error: "檔案不屬於此送審資料" }, { status: 400 });
  }

  const comment = createDiscussionComment({
    submissionId: id,
    fileId,
    authorId: auth.user.id,
    body: text
  });

  return NextResponse.json({ comment }, { status: 201 });
}
