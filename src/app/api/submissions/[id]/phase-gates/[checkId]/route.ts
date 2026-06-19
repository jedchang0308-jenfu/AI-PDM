import { NextResponse } from "next/server";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { decidePhaseGateCheckAsync, getPhaseGateCheckAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, checkId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getPhaseGateCheckAsync({ submissionId: id, checkId });
  if (!existing) return NextResponse.json({ error: "Phase gate check not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "complete" && action !== "waive") {
    return NextResponse.json({ error: "Unsupported phase gate action" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = await decidePhaseGateCheckAsync({
    submissionId: id,
    checkId,
    decidedBy: auth.user.id,
    status: action === "complete" ? "completed" : "waived",
    comment
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ check: result.check });
}
