import { NextResponse } from "next/server";
import { forbidden, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { decidePhaseGateCheck, getPhaseGateCheck, getSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, checkId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getPhaseGateCheck({ submissionId: id, checkId });
  if (!existing) return NextResponse.json({ error: "找不到階段關卡檢核項目" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "complete" && action !== "waive") {
    return NextResponse.json({ error: "動作必須為完成或豁免" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = decidePhaseGateCheck({
    submissionId: id,
    checkId,
    decidedBy: auth.user.id,
    status: action === "complete" ? "completed" : "waived",
    comment
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ check: result.check });
}
