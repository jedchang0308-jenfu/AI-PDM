import { NextResponse } from "next/server";
import { getSubmission, revokeReadonlyShare } from "@/lib/db";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";

export const runtime = "nodejs";

function canManageShares(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const auth = requireAuth(_request);
  if (auth.response) return auth.response;
  if (!canManageShares(auth.user.role)) return forbidden();

  const { id, shareId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const share = revokeReadonlyShare({ submissionId: id, shareId, revokedBy: auth.user.id });
  if (!share) return NextResponse.json({ error: "找不到分享連結" }, { status: 404 });
  return NextResponse.json({ share });
}
