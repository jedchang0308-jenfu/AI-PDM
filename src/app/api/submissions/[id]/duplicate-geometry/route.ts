import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getSubmission, listDuplicateGeometryCandidates } from "@/lib/db";
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
    method: "file_fingerprint",
    note: "低成本重複幾何搜尋會使用原生檔案雜湊、CAD 檔名主體、檔案大小、材質與中繼資料訊號；這不是完整的幾何形狀比對。",
    candidates: listDuplicateGeometryCandidates({
      submissionId: id,
      submittedBy: scopedSubmittedBy(auth.user),
      limit: Number.isFinite(limit) ? limit : 6
    })
  });
}
