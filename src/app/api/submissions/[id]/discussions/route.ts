import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { createDiscussionCommentAsync, listDiscussionCommentsAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionFileAsync } from "@/lib/submission-files-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  return NextResponse.json({
    submissionId: id,
    comments: await listDiscussionCommentsAsync(id)
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const text = String(body.body ?? body.comment ?? "").trim();
  if (text.length < 2) {
    return NextResponse.json({ error: "comment body is too short" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "comment body is too long" }, { status: 400 });
  }

  const fileId = String(body.fileId ?? body.file_id ?? "").trim() || null;
  if (fileId && !(await getSubmissionFileAsync({ submissionId: id, fileId }))) {
    return NextResponse.json({ error: "Submission file not found" }, { status: 400 });
  }

  const comment = await createDiscussionCommentAsync({
    submissionId: id,
    fileId,
    authorId: auth.user.id,
    body: text
  });

  return NextResponse.json({ comment }, { status: 201 });
}
