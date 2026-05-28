import { NextResponse } from "next/server";
import { forbidden, requireRole } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { decideChangeRequest, getChangeRequest, getSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, changeId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getChangeRequest({ submissionId: id, changeId });
  if (!existing) return NextResponse.json({ error: "找不到變更需求" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "approve" && action !== "reject" && action !== "close") {
    return NextResponse.json({ error: "動作必須為核准、駁回或關閉" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = decideChangeRequest({
    submissionId: id,
    changeId,
    decidedBy: auth.user.id,
    status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "closed",
    comment
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ change: result.change });
}
