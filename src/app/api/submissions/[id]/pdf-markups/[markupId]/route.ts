import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getPdfMarkup, getSubmission, resolvePdfMarkup } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; markupId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id, markupId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const existing = getPdfMarkup({ submissionId: id, markupId });
  if (!existing) {
    return NextResponse.json({ error: "找不到 PDF 標註" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.resolved !== true && body.status !== "resolved") {
    return NextResponse.json({ error: "目前僅支援結案 PDF 標註" }, { status: 400 });
  }

  return NextResponse.json({
    markup: resolvePdfMarkup({ submissionId: id, markupId, resolvedBy: auth.user.id })
  });
}
