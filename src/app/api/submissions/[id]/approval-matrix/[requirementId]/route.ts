import { NextResponse } from "next/server";
import { forbidden, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getApprovalMatrixRequirement, getSubmission, waiveApprovalMatrixRequirement } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, requirementId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getApprovalMatrixRequirement({ submissionId: id, requirementId });
  if (!existing) return NextResponse.json({ error: "找不到簽核矩陣需求" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "waive") {
    return NextResponse.json({ error: "動作必須為豁免" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = waiveApprovalMatrixRequirement({
    submissionId: id,
    requirementId,
    decidedBy: auth.user.id,
    comment
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ requirement: result.requirement });
}
