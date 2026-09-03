import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { decideApprovalPlatformLegacySubmissionAsync } from "@/lib/approval-platform";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionLifecycleRequestByIdAsync } from "@/lib/submission-lifecycle-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { requestId } = await params;
  const lifecycleRequest = await getSubmissionLifecycleRequestByIdAsync(requestId);
  if (!lifecycleRequest) return NextResponse.json({ error: "Submission lifecycle request not found" }, { status: 404 });

  const submission = await getSubmissionAsync(lifecycleRequest.submission_id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  try {
    const result = await decideApprovalPlatformLegacySubmissionAsync({
      requestId,
      decision: "rejected",
      actor: auth.user,
      comment: typeof body.decisionReason === "string" ? body.decisionReason : undefined
    });
    return NextResponse.json({ request: result, submissionId: lifecycleRequest.submission_id, status: submission.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SUBMISSION_OBSOLETE_REJECT_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("LIFE_OBSOLETE_REVIEW_NOT_PENDING") ? 409 : 400 });
  }
}
