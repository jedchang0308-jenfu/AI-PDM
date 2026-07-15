import { NextResponse } from "next/server";
import { revokeAccountSessionBySessionIdAsync } from "@/lib/account-session-registry";
import { createAuditLogAsync } from "@/lib/audit-async";
import {
  clearPrivacyPendingCookie,
  createFirebaseHostingLogoutCookie,
  createLogoutCookie,
  getLegacySessionPayload,
  getSessionToken
} from "@/lib/auth";
import { getSessionUserAsync } from "@/lib/auth-async";
import { getAuthMode } from "@/lib/auth-config";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";

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
  response.headers.append("set-cookie", clearPrivacyPendingCookie());
  return response;
}
