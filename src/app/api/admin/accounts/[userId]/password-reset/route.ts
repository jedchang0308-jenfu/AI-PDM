import { NextResponse } from "next/server";
import { sendProviderRecoveryHandoffForUserAsync } from "@/lib/account-recovery-handoff";
import { AccountLifecycleError, createAdminAccountPasswordResetAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "password_reset_failed", message: "密碼重設連結建立失敗，請稍後重試。" }, { status: 500 });
}

function publicBaseUrl(request: Request) {
  const configured = process.env.PDM_PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Production branch reports the missing usable URL.
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new AccountLifecycleError("public_url_not_configured", "正式環境尚未設定有效的 PDM_PUBLIC_BASE_URL，請完成網址設定後再建立重設連結。", 503);
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    if (getAuthMode() === "firebase_bff") {
      const handoff = await sendProviderRecoveryHandoffForUserAsync({
        request,
        actorId: auth.user.id,
        userId
      });
      return NextResponse.json({ handoff }, { status: 202, headers: { "cache-control": "no-store" } });
    }
    const created = await createAdminAccountPasswordResetAsync({
      actorId: auth.user.id,
      userId,
      expiresInMinutes: Number(body.expiresInMinutes ?? 60)
    });
    const resetUrl = new URL("/account-recovery", publicBaseUrl(request));
    resetUrl.hash = `token=${encodeURIComponent(created.token)}`;
    return NextResponse.json({ request: created.request, resetUrl: resetUrl.toString() }, { status: 201 });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
