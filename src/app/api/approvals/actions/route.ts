import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { listApprovalPlatformActionsAsync } from "@/lib/approval-platform";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const actions = await listApprovalPlatformActionsAsync();
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    actions
  });
}
