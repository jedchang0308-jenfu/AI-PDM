import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getBomWorkbenchBySubmissionId, getSubmission } from "@/lib/db";
import { canReadBomDraft } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId")?.trim();
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  return NextResponse.json({
    workbench: getBomWorkbenchBySubmissionId(submissionId)
  });
}
