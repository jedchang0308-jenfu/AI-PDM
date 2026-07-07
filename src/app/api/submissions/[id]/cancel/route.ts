import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { cancelPendingSubmissionAsync } from "@/lib/submission-status-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? body.comment ?? "取消送審。").trim() || "取消送審。";
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  const sameCompany = !submission.company_id || submission.company_id === auth.user.company_id;
  if (!(await canReadSubmissionAsync(auth.user, submission))) {
    if (sameCompany && auth.user.role === "Engineer") {
      return NextResponse.json(
        { error: "cancel_not_allowed", message: "你目前不能取消這筆送審，請由送審建立者、主管或 Admin 處理。" },
        { status: 403 }
      );
    }
    return forbidden();
  }
  const canCancel = submission.submitted_by === auth.user.id || auth.user.role === "R&D Manager" || auth.user.role === "Admin";
  if (!canCancel) {
    return NextResponse.json(
      { error: "cancel_not_allowed", message: "你目前不能取消這筆送審，請由送審建立者、主管或 Admin 處理。" },
      { status: 403 }
    );
  }
  if (submission.status !== "Pending") {
    return NextResponse.json(
      { error: "submission_not_pending", message: "只有審核中的送審可以取消。" },
      { status: 409 }
    );
  }

  await cancelPendingSubmissionAsync({ id, actorId: auth.user.id, reason });
  await createAuditLogAsync({ submissionId: id, actorId: auth.user.id, action: "submission.cancelled", detail: { reason } });
  return NextResponse.json({ submissionId: id, status: "Cancelled", message: "送審已取消，可重新建立同版次送審。" });
}
