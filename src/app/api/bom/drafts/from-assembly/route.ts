import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { createBomWorkbenchDraftFromAssemblyAsync } from "@/lib/bom-workbench-async";
import { canReadBomDraftAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

type RequestBody = {
  submissionId?: unknown;
  draftName?: unknown;
  setActive?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = await getSubmissionAsync(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadBomDraftAsync(auth.user, submission))) return forbidden();

  const draft = await createBomWorkbenchDraftFromAssemblyAsync({
    submissionId,
    actorId: auth.user.id,
    draftName: typeof body.draftName === "string" ? body.draftName : undefined,
    setActive: typeof body.setActive === "boolean" ? body.setActive : true
  });

  return NextResponse.json({ draft }, { status: 201 });
}
