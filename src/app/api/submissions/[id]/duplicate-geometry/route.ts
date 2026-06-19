import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync, scopedSubmittedBy } from "@/lib/permissions";
import { getSubmissionAsync, listDuplicateGeometryCandidatesAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "6");

  return NextResponse.json({
    submissionId: id,
    method: "file_fingerprint",
    note: "Duplicate geometry candidates are currently estimated by file fingerprint and CAD metadata hints.",
    candidates: await listDuplicateGeometryCandidatesAsync({
      submissionId: id,
      submittedBy: scopedSubmittedBy(auth.user),
      limit: Number.isFinite(limit) ? limit : 6
    })
  });
}

