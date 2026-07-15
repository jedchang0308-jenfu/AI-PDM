import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailAsync } from "@/lib/approval-platform";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { requestId } = await params;
  const detail = await getApprovalPlatformRequestDetailAsync(safeDecode(requestId));
  if (!detail) return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  if (detail.actionCode === "numbering.candidate_publication_review" && detail.companyId !== auth.user.company_id) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }
  return NextResponse.json({ request: detail });
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
