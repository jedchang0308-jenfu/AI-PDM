import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { buildSubmissionLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { requestSubmissionObsoleteReviewAsync } from "@/lib/submission-lifecycle-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  try {
    const lifecycleRequest = await requestSubmissionObsoleteReviewAsync({
      submissionId: id,
      actorId: auth.user.id,
      reason
    });
    if (!lifecycleRequest) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    return NextResponse.json(
      {
        request: lifecycleRequest,
        policy: buildSubmissionLifecyclePolicy({
          submissionId: id,
          status: submission.status,
          pendingObsoleteRequest: true,
          canRequestObsolete: true
        })
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "SUBMISSION_OBSOLETE_REQUEST_FAILED";
    return NextResponse.json({ error: message }, { status: submissionObsoleteErrorStatus(message) });
  }
}

function submissionObsoleteErrorStatus(message: string) {
  if (message.includes("PERMISSION")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (
    message.includes("LIFE_OBSOLETE_ALREADY_REQUESTED") ||
    message.includes("LIFE_OBSOLETE_ALREADY_APPROVED") ||
    message.includes("LIFE_OBSOLETE_NOT_FORMAL")
  ) {
    return 409;
  }
  return 400;
}
