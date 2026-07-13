import { NextResponse } from "next/server";
import {
  AccountLifecycleError,
  updateAdminAccountLifecycleAsync,
  type AccountLifecycleAction
} from "@/lib/account-lifecycle";
import { requireRoleAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

const validActions = new Set<AccountLifecycleAction>(["suspend", "reactivate", "offboard", "return_to_work"]);

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號狀態異動失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "") as AccountLifecycleAction;
  if (!validActions.has(action)) {
    return NextResponse.json({ error: "invalid_lifecycle_action", message: "不支援的帳號狀態異動。" }, { status: 400 });
  }

  try {
    const account = await updateAdminAccountLifecycleAsync({
      actorId: auth.user.id,
      userId,
      action,
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
