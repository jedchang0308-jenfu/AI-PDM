import { NextResponse } from "next/server";
import { addApprovalAsync, reviewerHasDecisionAsync } from "@/lib/approval-async";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { rejectSubmissionAsync } from "@/lib/submission-status-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import { resolveLegacyDrawingLifecycleNavigation } from "@/lib/approval-workbench-legacy-redirect";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const lifecycleNavigation = await resolveLegacyDrawingLifecycleNavigation({
    submissionId: id,
    actorId: auth.user.id,
    companyId: auth.user.company_id
  });
  if (lifecycleNavigation) {
    return NextResponse.json(
      {
        error: "DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED",
        code: "DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED",
        message: "這筆圖面進版已改由審核工作台處理。",
        canonicalHref: lifecycleNavigation.canonicalHref
      },
      { status: 410 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const reviewerId = auth.user.id;
  const reason = String(body.reason ?? body.comment ?? "Rejected").trim();
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "Pending") {
    return NextResponse.json({ error: `Only Pending submissions can be rejected. Current status: ${submission.status}` }, { status: 409 });
  }
  if (submission.release_actionability?.code.startsWith("SUBMISSION_RELEASE_TERMINAL_")) {
    return NextResponse.json(
      {
        error: submission.release_actionability.code,
        code: submission.release_actionability.code,
        message: submission.release_actionability.message,
        recoveryHref: submission.release_actionability.recovery_href
      },
      { status: 409 }
    );
  }
  if (await reviewerHasDecisionAsync({ submissionId: id, reviewerId })) {
    return NextResponse.json({ error: "Reviewer already decided this submission" }, { status: 409 });
  }

  await addApprovalAsync({ submissionId: id, reviewerId, decision: "Rejected", comment: reason });
  await rejectSubmissionAsync({ id, rejectReason: reason });
  await createAuditLogAsync({ submissionId: id, actorId: reviewerId, action: "Reject", detail: { reason } });
  return NextResponse.json({ submissionId: id, status: "Rejected" });
}
