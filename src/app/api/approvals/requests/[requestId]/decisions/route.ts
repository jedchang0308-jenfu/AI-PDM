import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { decideApprovalPlatformRequestAsync } from "@/lib/approval-platform";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { requestId } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = String(body.decision ?? "").trim();
  if (decision !== "approved" && decision !== "rejected" && decision !== "needs_info") {
    return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });
  }

  try {
    const result = await decideApprovalPlatformRequestAsync({
      requestId: safeDecode(requestId),
      decision,
      comment: nullableText(body.comment ?? body.decisionReason ?? body.decision_reason),
      actor: auth.user,
      companyId: String(body.companyId ?? body.company_id ?? "").trim() || undefined,
      basisQty: numberOrUndefined(body.basisQty ?? body.basis_qty)
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPROVAL_DECISION_FAILED";
    return NextResponse.json({ error: message }, { status: approvalErrorStatus(message) });
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function approvalErrorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("ALREADY") || message.includes("NOT_PENDING") || message.includes("NOT_READY")) return 409;
  if (message.includes("UNSUPPORTED") || message.includes("NOT_REGISTERED") || message.includes("REQUIRED")) return 400;
  return 500;
}
