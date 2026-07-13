import { NextResponse } from "next/server";
import { AccountLifecycleError, getAdminAccountDetailAsync } from "@/lib/account-lifecycle";
import { requireRoleAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireRoleAsync(request, ["Admin"]);
  if (auth.response) return auth.response;

  const { userId } = await params;
  try {
    const account = await getAdminAccountDetailAsync(userId);
    if (!account) return NextResponse.json({ error: "account_not_found", message: "找不到指定帳號。" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
