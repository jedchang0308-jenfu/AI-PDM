import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getBomBySubmissionId, getSubmission, materializeBomDraftFromReferences } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const url = new URL(request.url);
  const materialize = url.searchParams.get("materialize") === "1";
  const bom = materialize ? materializeBomDraftFromReferences(id) : getBomBySubmissionId(id);

  return NextResponse.json({
    submissionId: id,
    materialized: materialize,
    bom
  });
}
