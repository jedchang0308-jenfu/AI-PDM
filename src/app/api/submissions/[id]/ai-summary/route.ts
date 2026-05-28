import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { buildAiSubmissionSummary } from "@/lib/ai-submission-summary";
import { getSubmission } from "@/lib/db";
import { canReadSubmission, scopedSubmittedBy } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({
    summary: buildAiSubmissionSummary({
      submission,
      submittedBy: scopedSubmittedBy(auth.user)
    })
  });
}
