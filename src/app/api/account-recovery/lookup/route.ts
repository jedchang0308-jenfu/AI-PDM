import { NextResponse } from "next/server";
import { AccountLifecycleError, lookupAccountRecoveryAsync } from "@/lib/account-lifecycle";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_recovery_lookup_failed", message: "連結資料暫時無法讀取，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await lookupAccountRecoveryAsync(String(body.token ?? ""));
    return NextResponse.json({
      request: {
        status: result.request.status,
        expiresAt: result.request.expiresAt
      },
      account: {
        displayName: result.user.display_name,
        email: result.user.email,
        accountStatus: result.user.account_status
      }
    });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
