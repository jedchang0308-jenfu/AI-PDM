import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { issueRegisteredLegacySessionCookieAsync } from "@/lib/account-session-registry";
import { serializeAuthUserAsync } from "@/lib/company-context";
import {
  ensureLocalQuickLoginUserAsync,
  findLocalQuickLoginAccount,
  isLocalQuickLoginAvailable
} from "@/lib/local-quick-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isLocalQuickLoginAvailable(request)) {
    return NextResponse.json({ error: "本機快速登入未開放" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const account = findLocalQuickLoginAccount(String(body.role ?? ""));
  if (!account) return NextResponse.json({ error: "未知的快速登入角色" }, { status: 400 });

  try {
    const user = await ensureLocalQuickLoginUserAsync(account);
    await createAuditLogAsync({
      actorId: user.id,
      action: "Login",
      detail: { email: user.email, role: user.role, source: "local-quick-login" }
    });
    return NextResponse.json(
      { user: await serializeAuthUserAsync(user) },
      { headers: { "set-cookie": await issueRegisteredLegacySessionCookieAsync({ request, user }) } }
    );
  } catch (error) {
    console.error("[local-quick-login] failed", error);
    return NextResponse.json({ error: "本機快速登入建立失敗，請查看地端伺服器記錄" }, { status: 500 });
  }
}
