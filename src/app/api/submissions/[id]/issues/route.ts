import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { createReviewIssue, getSubmission, getSubmissionFile, getUserById, listReviewIssues } from "@/lib/db";

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
    issues: listReviewIssues(id)
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
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? body.body ?? "").trim();
  if (title.length < 2) {
    return NextResponse.json({ error: "問題標題為必填" }, { status: 400 });
  }
  if (title.length > 160) {
    return NextResponse.json({ error: "issue title is too long" }, { status: 400 });
  }
  if (description.length < 2) {
    return NextResponse.json({ error: "問題描述為必填" }, { status: 400 });
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: "issue description is too long" }, { status: 400 });
  }

  const fileId = String(body.fileId ?? body.file_id ?? "").trim() || null;
  if (fileId && !getSubmissionFile({ submissionId: id, fileId })) {
    return NextResponse.json({ error: "檔案不屬於此送審資料" }, { status: 400 });
  }
  const assigneeId = String(body.assigneeId ?? body.assignee_id ?? "").trim() || submission.submitted_by;
  if (!getUserById(assigneeId)) {
    return NextResponse.json({ error: "負責人不存在" }, { status: 400 });
  }

  const issue = createReviewIssue({
    submissionId: id,
    fileId,
    raisedBy: auth.user.id,
    assigneeId,
    title,
    description
  });

  return NextResponse.json({ issue }, { status: 201 });
}
