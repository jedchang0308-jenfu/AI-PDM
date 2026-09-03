import { NextResponse } from "next/server";
import { AccountLifecycleError, updateAdminAccountIdentityAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import type { AuthIdentityStatus } from "@/lib/repositories/auth-identity-async-repository";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "identity_lifecycle_failed", message: "登入方式異動失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string; identityId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId, identityId } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? body.action ?? "");
  if (status !== "active" && status !== "disabled") {
    return NextResponse.json({ error: "invalid_identity_status", message: "登入方式狀態只能是啟用或停用。" }, { status: 400 });
  }

  try {
    const account = await updateAdminAccountIdentityAsync({
      actorId: auth.user.id,
      userId,
      identityId,
      status: status as AuthIdentityStatus,
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
