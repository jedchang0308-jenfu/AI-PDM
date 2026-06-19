import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getPdfMarkupAsync, resolvePdfMarkupAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; markupId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id, markupId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const existing = await getPdfMarkupAsync({ submissionId: id, markupId });
  if (!existing) {
    return NextResponse.json({ error: "PDF markup not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "Patch requires resolved status" }, { status: 400 });
  }

  return NextResponse.json({
    markup: await resolvePdfMarkupAsync({ submissionId: id, markupId, resolvedBy: auth.user.id })
  });
}
