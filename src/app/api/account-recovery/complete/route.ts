import { NextResponse } from "next/server";
import { AccountLifecycleError, completeAccountRecoveryAsync } from "@/lib/account-lifecycle";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_recovery_failed", message: "密碼重設失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await completeAccountRecoveryAsync({
      token: String(body.token ?? ""),
      password: String(body.password ?? "")
    });
    return NextResponse.json({
      request: {
        status: result.request.status,
        usedAt: result.request.usedAt
      }
    });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
