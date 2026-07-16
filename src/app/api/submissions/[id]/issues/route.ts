import { NextResponse } from "next/server";
import { forbidden, getUserByIdAsync, requireAuthAsync } from "@/lib/auth-async";
import { createReviewIssueAsync, listReviewIssuesAsync } from "@/lib/collaboration-async";
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
    issues: await listReviewIssuesAsync(id)
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
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? body.body ?? "").trim();
  if (title.length < 2) {
    return NextResponse.json({ error: "issue title is too short" }, { status: 400 });
  }
  if (title.length > 160) {
    return NextResponse.json({ error: "issue title is too long" }, { status: 400 });
  }
  if (description.length < 2) {
    return NextResponse.json({ error: "issue description is too short" }, { status: 400 });
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: "issue description is too long" }, { status: 400 });
  }

  const fileId = String(body.fileId ?? body.file_id ?? "").trim() || null;
  if (fileId && !(await getSubmissionFileAsync({ submissionId: id, fileId }))) {
    return NextResponse.json({ error: "Submission file not found" }, { status: 400 });
  }
  const assigneeId = String(body.assigneeId ?? body.assignee_id ?? "").trim() || submission.submitted_by;
  if (!(await getUserByIdAsync(assigneeId))) {
    return NextResponse.json({ error: "Assignee not found" }, { status: 400 });
  }

  const issue = await createReviewIssueAsync({
    submissionId: id,
    fileId,
    raisedBy: auth.user.id,
    assigneeId,
    title,
    description
  });

  return NextResponse.json({ issue }, { status: 201 });
}
