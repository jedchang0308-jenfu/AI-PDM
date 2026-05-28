import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getSubmission, listDesignReuseCandidates } from "@/lib/db";
import { canReadSubmission, scopedSubmittedBy } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "6");

  return NextResponse.json({
    submissionId: id,
    candidates: listDesignReuseCandidates({
      submissionId: id,
      submittedBy: scopedSubmittedBy(auth.user),
      limit: Number.isFinite(limit) ? limit : 6
    })
  });
}
