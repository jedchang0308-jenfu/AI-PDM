import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getDiscussionCommentAsync, resolveDiscussionCommentAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id, commentId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getDiscussionCommentAsync({ submissionId: id, commentId });
  if (!existing) {
    return NextResponse.json({ error: "Discussion comment not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "Patch requires resolved status" }, { status: 400 });
  }

  return NextResponse.json({
    comment: await resolveDiscussionCommentAsync({ submissionId: id, commentId, resolvedBy: auth.user.id })
  });
}
