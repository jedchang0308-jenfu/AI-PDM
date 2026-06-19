import { NextResponse } from "next/server";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { revokeReadonlyShareAsync } from "@/lib/release-records-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id, shareId } = await params;
  const submission = await getSubmissionAsync(id);
  if (!submission) return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const share = await revokeReadonlyShareAsync({ submissionId: id, shareId, revokedBy: auth.user.id });
  if (!share) return NextResponse.json({ error: "?曆??啣?鈭恍??" }, { status: 404 });
  return NextResponse.json({ share });
}

