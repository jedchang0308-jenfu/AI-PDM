import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getBomBySubmissionIdAsync } from "@/lib/bom-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const url = new URL(request.url);
  if (url.searchParams.get("materialize") === "1") {
    return NextResponse.json({ error: "BOM_MATERIALIZATION_RETIRED" }, { status: 422 });
  }
  const bom = await getBomBySubmissionIdAsync(id);

  return NextResponse.json({
    submissionId: id,
    bom
  });
}

