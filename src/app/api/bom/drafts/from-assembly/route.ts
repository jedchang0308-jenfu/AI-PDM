import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { createBomWorkbenchDraftFromAssembly, getSubmission } from "@/lib/db";
import { canReadBomDraft } from "@/lib/permissions";

export const runtime = "nodejs";

type RequestBody = {
  submissionId?: unknown;
  draftName?: unknown;
  setActive?: unknown;
};

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = getSubmission(submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  const draft = createBomWorkbenchDraftFromAssembly({
    submissionId,
    actorId: auth.user.id,
    draftName: typeof body.draftName === "string" ? body.draftName : undefined,
    setActive: typeof body.setActive === "boolean" ? body.setActive : true
  });

  return NextResponse.json({ draft }, { status: 201 });
}
