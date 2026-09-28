import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createFirebaseHostingLogoutCookie, createLogoutCookie, getSessionCookieToken } from "@/lib/auth";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on") {
      return NextResponse.json({ code: "principal_authorization_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
  } catch {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "登出要求來源無效。", code: "auth_origin_invalid" }, { status: 403 });
  }

  const token = getSessionCookieToken(request);
  if (token) {
    let principalClaims: ReturnType<typeof verifyJenfuPrincipalSession> | null = null;
    try {
      principalClaims = verifyJenfuPrincipalSession(token, getPlatformSessionKeyRing());
    } catch {
      principalClaims = null;
    }
    if (principalClaims) {
      try {
        await new JenfuPrincipalSessionRegistry(getAsyncDatabaseClient()).revoke(principalClaims, "logout");
      } catch {
        return NextResponse.json(
          { error: "登出服務暫時無法使用。", code: "auth_server_not_configured" },
          { status: 503, headers: { "cache-control": "no-store" } }
        );
      }
      await createAuditLogAsync({
        action: "Logout",
        detail: { securityActor: { principalId: principalClaims.principalId,
          profileVersion: principalClaims.profileVersion, actorKind: "human", reason: "local_logout" } }
      }).catch(() => undefined);
    }
  }
  const response = NextResponse.json({ status: "completed" }, { headers: { "cache-control": "no-store" } });
  response.headers.append("set-cookie", createFirebaseHostingLogoutCookie());
  response.headers.append("set-cookie", createLogoutCookie());
  return response;
}
