import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { DrawingSubmissionWorkbenchError, returnReleaseFailedSubmissionForCorrectionAsync } from "@/lib/drawing-submission-workbench";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? body.comment ?? "退回修正發行未完成。").trim() || "退回修正發行未完成。";
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  try {
    const result = await returnReleaseFailedSubmissionForCorrectionAsync({
      submissionId: id,
      actorId: auth.user.id,
      reason,
      selectedAttachmentIds: Array.isArray(body.selectedAttachmentIds)
        ? body.selectedAttachmentIds.map((value: unknown) => String(value))
        : undefined
    });
    await createAuditLogAsync({
      submissionId: id,
      actorId: auth.user.id,
      action: "release_incomplete.returned_for_correction",
      detail: { reason, newSubmissionId: result.submissionId }
    });
    return NextResponse.json({
      ...result,
      message: "已建立退回修正送審，請在新送審完成修正後重新審核。"
    });
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          details: error.details,
          recoveryHref: error.options.recoveryHref,
          existingSubmission: error.options.existingSubmission
        },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        error: "return_for_correction_failed",
        message: "退回修正建立失敗，請重新整理後再試或通知管理員。"
      },
      { status: 500 }
    );
  }
}
