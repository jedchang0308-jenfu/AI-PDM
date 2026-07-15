import { NextResponse } from "next/server";
import { acceptAccountInvitationAsync, AccountInvitationError } from "@/lib/account-invitations";
import { issueRegisteredLegacySessionCookieAsync } from "@/lib/account-session-registry";
import { getUserByIdAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { serializeAuthUserAsync } from "@/lib/company-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (getAuthMode() === "firebase_bff") {
    return NextResponse.json({ error: "legacy_invitation_disabled", message: "請使用 Firebase 管理的邀請連結。" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const accepted = await acceptAccountInvitationAsync({
      token: String(body.token ?? ""),
      password: String(body.password ?? "")
    });
    const user = await getUserByIdAsync(accepted.userId);
    if (!user) {
      return NextResponse.json({ error: "account_activation_failed", message: "帳號已建立但登入資料讀取失敗，請回到登入頁重試。" }, { status: 500 });
    }
    return NextResponse.json(
      { invitation: accepted.invitation, user: await serializeAuthUserAsync(user) },
      { headers: { "set-cookie": await issueRegisteredLegacySessionCookieAsync({ request, user }) } }
    );
  } catch (error) {
    if (error instanceof AccountInvitationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
    }
    return NextResponse.json({ error: "account_activation_failed", message: "帳號設定失敗，請稍後重試。" }, { status: 500 });
  }
}
