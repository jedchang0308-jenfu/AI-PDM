import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getBomBySubmissionIdAsync, materializeBomDraftFromReferencesAsync } from "@/lib/bom-async";
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
  const materialize = url.searchParams.get("materialize") === "1";
  const bom = materialize ? await materializeBomDraftFromReferencesAsync(id) : await getBomBySubmissionIdAsync(id);

  return NextResponse.json({
    submissionId: id,
    materialized: materialize,
    bom
  });
}

