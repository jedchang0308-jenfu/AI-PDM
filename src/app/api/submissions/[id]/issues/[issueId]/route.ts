import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getReviewIssueAsync, resolveReviewIssueAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id, issueId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getReviewIssueAsync({ submissionId: id, issueId });
  if (!existing) {
    return NextResponse.json({ error: "Review issue not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "Patch requires resolved status" }, { status: 400 });
  }

  const resolution = String(body.resolution ?? "").trim() || "Resolved during review";
  if (resolution.length > 2000) {
    return NextResponse.json({ error: "issue resolution is too long" }, { status: 400 });
  }

  return NextResponse.json({
    issue: await resolveReviewIssueAsync({ submissionId: id, issueId, resolvedBy: auth.user.id, resolution })
  });
}
