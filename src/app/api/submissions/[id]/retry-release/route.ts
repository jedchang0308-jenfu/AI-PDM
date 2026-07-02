import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { executeSubmissionReleaseWorkflowAsync } from "@/lib/submission-release-workflow";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "ReleaseFailed") {
    return NextResponse.json(
      { error: "submission_not_release_incomplete", message: "只有發行未完成的送審可以重新發行。" },
      { status: 409 }
    );
  }
  if (submission.resolved_by_submission_id || submission.resolved_at) {
    return NextResponse.json(
      { error: "release_incomplete_already_resolved", message: "這筆發行未完成已由後續送審處理完成。" },
      { status: 409 }
    );
  }

  await createAuditLogAsync({
    submissionId: id,
    actorId: auth.user.id,
    action: "release_incomplete.retry_requested",
    detail: { previousReleaseError: submission.release_error ?? null }
  });
  const releaseResult = await executeSubmissionReleaseWorkflowAsync({
    submissionId: id,
    actorId: auth.user.id,
    auditAction: "ReleaseRetrySucceeded"
  });

  if (!releaseResult.ok) {
    return NextResponse.json(
      {
        error: "release_retry_failed",
        message: releaseResult.error || "重新發行失敗，此送審仍是發行未完成，請主管或 Admin 繼續處理。",
        status: "ReleaseFailed"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    submissionId: id,
    status: "Released",
    message: "重新發行完成。",
    release: releaseResult.release,
    lifecycle: releaseResult.lifecycle
  });
}
