import { NextResponse } from "next/server";
import { AccountLifecycleError, listAdminAccountsAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });
}

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  try {
    const accounts = await listAdminAccountsAsync({
      query: url.searchParams.get("query") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100)
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
