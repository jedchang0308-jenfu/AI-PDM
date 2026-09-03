import { NextResponse } from "next/server";
import { revokeAccountSessionBySessionIdAsync } from "@/lib/account-session-registry";
import { createAuditLogAsync } from "@/lib/audit-async";
import {
  createFirebaseHostingLogoutCookie,
  createLogoutCookie,
  getLegacySessionPayload,
  getSessionCookieToken,
  getSessionToken
} from "@/lib/auth";
import { getSessionUserAsync, getUserByIdAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { verifyJenfuPlatformSessionV1 } from "@/lib/jenfu-platform-session-v1";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

function currentSessionId(request: Request) {
  if (getAuthMode() === "firebase_bff") {
    const token = getSessionToken(request);
    if (!token) return null;
    try {
      return verifyPlatformSessionV2(token, getPlatformSessionKeyRing()).sessionId;
    } catch {
      return null;
    }
  }
  return getLegacySessionPayload(request)?.sessionId ?? null;
}

export async function POST(request: Request) {
  if (getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on") {
    if (!isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "登出要求來源無效。", code: "auth_origin_invalid" }, { status: 403 });
    }
    const token = getSessionCookieToken(request);
    if (token) {
      let claims: ReturnType<typeof verifyJenfuPlatformSessionV1> | null = null;
      try {
        claims = verifyJenfuPlatformSessionV1(token, getPlatformSessionKeyRing());
      } catch {
        claims = null;
      }
      if (claims) {
        try {
          await revokeAccountSessionBySessionIdAsync({
            actorId: claims.localPrincipalId,
            userId: claims.localPrincipalId,
            sessionId: claims.sessionId,
            reason: "logout"
          });
        } catch {
          return NextResponse.json(
            { error: "登出服務暫時無法使用。", code: "auth_server_not_configured" },
            { status: 503, headers: { "cache-control": "no-store" } }
          );
        }
        const user = await getUserByIdAsync(claims.localPrincipalId).catch(() => null);
        if (user) {
          await createAuditLogAsync({ actorId: user.id, action: "Logout", detail: { email: user.email } }).catch(() => undefined);
        }
      }
    }
    const response = NextResponse.json({ status: "completed" }, { headers: { "cache-control": "no-store" } });
    response.headers.append("set-cookie", createFirebaseHostingLogoutCookie());
    response.headers.append("set-cookie", createLogoutCookie());
    return response;
  }

  const user = await getSessionUserAsync(request);
  if (user) {
    const sessionId = currentSessionId(request);
    if (sessionId) {
      await revokeAccountSessionBySessionIdAsync({
        actorId: user.id,
        userId: user.id,
        sessionId,
        reason: "logout"
      });
    }
    await createAuditLogAsync({ actorId: user.id, action: "Logout", detail: { email: user.email } });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", createFirebaseHostingLogoutCookie());
  response.headers.append("set-cookie", createLogoutCookie());
  return response;
}
