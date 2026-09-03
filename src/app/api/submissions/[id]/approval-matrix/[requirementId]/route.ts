import { NextResponse } from "next/server";
import { getApprovalMatrixRequirementAsync, waiveApprovalMatrixRequirementAsync } from "@/lib/approval-async";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, requirementId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getApprovalMatrixRequirementAsync({ submissionId: id, requirementId });
  if (!existing) return NextResponse.json({ error: "Approval matrix requirement not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "waive") {
    return NextResponse.json({ error: "Unsupported approval matrix action" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = await waiveApprovalMatrixRequirementAsync({
    submissionId: id,
    requirementId,
    decidedBy: auth.user.id,
    comment
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ requirement: result.requirement });
}
