import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { getSubmission, listSupplierPortalResponses } from "@/lib/db";

export const runtime = "nodejs";

function canManageSupplierPortal(role: string) {
  return role === "R&D Manager" || role === "Admin";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (!canManageSupplierPortal(auth.user.role)) return forbidden();

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  return NextResponse.json({ responses: listSupplierPortalResponses({ submissionId: id }) });
}
