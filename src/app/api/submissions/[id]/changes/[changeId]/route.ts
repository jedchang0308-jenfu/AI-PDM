import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { decideChangeRequestAsync, getChangeRequestAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, changeId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getChangeRequestAsync({ submissionId: id, changeId });
  if (!existing) return NextResponse.json({ error: "Change request not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "").trim();
  const comment = String(body.comment ?? "").trim();
  if (action !== "approve" && action !== "reject" && action !== "close") {
    return NextResponse.json({ error: "action must be approve, reject, or close" }, { status: 400 });
  }
  if (comment.length > 1000) {
    return NextResponse.json({ error: "comment is too long" }, { status: 400 });
  }

  const result = await decideChangeRequestAsync({
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
