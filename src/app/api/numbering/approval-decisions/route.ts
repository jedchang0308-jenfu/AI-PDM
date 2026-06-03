import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth";
import { decideNumberingApproval } from "@/lib/db";
import { requireNumberingAction } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.approval.batch.decide");
  if (auth.response) return auth.response;
  if (auth.user.role !== "R&D Manager" && auth.user.role !== "Admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  const approvalRequestId = String(body.approvalRequestId ?? body.approval_request_id ?? "").trim();
  const decision = String(body.decision ?? "").trim();

  if (!approvalRequestId) {
    return NextResponse.json({ error: "approvalRequestId is required" }, { status: 400 });
  }
  if (decision !== "approved" && decision !== "rejected" && decision !== "needs_info") {
    return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });
  }

  try {
    const result = decideNumberingApproval({
      approvalRequestId,
      decision,
      comment: String(body.comment ?? "").trim(),
      approverRole: auth.user.role,
      approverId: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decide numbering approval";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("ALREADY_RESOLVED") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
