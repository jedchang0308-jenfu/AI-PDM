import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { applyApprovalPlatformRequestAsync } from "@/lib/approval-platform";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { requestId } = await params;
  try {
    const result = await applyApprovalPlatformRequestAsync({
      requestId: safeDecode(requestId),
      actor: auth.user
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPROVAL_APPLY_FAILED";
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

function approvalErrorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("NOT_READY")) return 409;
  if (message.includes("UNSUPPORTED") || message.includes("NOT_REGISTERED")) return 400;
  return 500;
}
