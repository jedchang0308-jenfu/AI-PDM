import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { closeSupplierPortalResponse, getSubmission } from "@/lib/db";

export const runtime = "nodejs";

function canManageSupplierPortal(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageSupplierPortal(auth.user.role)) return forbidden();

  const { id, responseId } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const result = closeSupplierPortalResponse({
    submissionId: id,
    responseId,
    closedBy: auth.user.id
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ response: result.response });
}
