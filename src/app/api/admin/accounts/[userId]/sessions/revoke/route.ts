import { NextResponse } from "next/server";
import { AccountLifecycleError, revokeAdminAccountSessionsAsync } from "@/lib/account-lifecycle";
import { requireRoleAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_session_revoke_failed", message: "撤銷登入狀態失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const account = await revokeAdminAccountSessionsAsync({
      actorId: auth.user.id,
      userId,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
