import { NextResponse } from "next/server";
import { forbidden, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { listSupplierPortalResponsesAsync } from "@/lib/release-records-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  return NextResponse.json({ responses: await listSupplierPortalResponsesAsync({ submissionId: id }) });
}

