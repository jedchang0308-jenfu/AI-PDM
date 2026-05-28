import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { addApproval, createAuditLog, getSubmission, reviewerHasDecision, updateSubmissionStatus } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reviewerId = auth.user.id;
  const reason = String(body.reason ?? body.comment ?? "Rejected").trim();
  const submission = getSubmission(id);

  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (submission.status !== "Pending") {
    return NextResponse.json({ error: `Only Pending submissions can be rejected. Current status: ${submission.status}` }, { status: 409 });
  }
  if (reviewerHasDecision({ submissionId: id, reviewerId })) {
    return NextResponse.json({ error: "審核者已決議此送審資料" }, { status: 409 });
  }

  addApproval({ submissionId: id, reviewerId, decision: "Rejected", comment: reason });
  updateSubmissionStatus({ id, status: "Rejected", rejectReason: reason });
  createAuditLog({ submissionId: id, actorId: reviewerId, action: "Reject", detail: { reason } });
  return NextResponse.json({ submissionId: id, status: "Rejected" });
}
