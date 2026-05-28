import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getReviewIssue, getSubmission, resolveReviewIssue } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id, issueId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getReviewIssue({ submissionId: id, issueId });
  if (!existing) {
    return NextResponse.json({ error: "找不到審核問題" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "目前僅支援結案問題" }, { status: 400 });
  }

  const resolution = String(body.resolution ?? "").trim() || "Resolved during review";
  if (resolution.length > 2000) {
    return NextResponse.json({ error: "issue resolution is too long" }, { status: 400 });
  }

  return NextResponse.json({
    issue: resolveReviewIssue({ submissionId: id, issueId, resolvedBy: auth.user.id, resolution })
  });
}
