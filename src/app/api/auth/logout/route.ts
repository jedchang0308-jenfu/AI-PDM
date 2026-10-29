import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createFirebaseHostingLogoutCookie, createLogoutCookie, getSessionCookieToken } from "@/lib/auth";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import { principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import {
  clearLocalPrincipalSessionCookie,
  getLocalSandboxPrincipalRuntime,
  isLocalPrincipalSandboxRequested,
} from "@/lib/local-sandbox-principal-runtime";
import { assertLocalSandboxRequest } from "../../../../../contracts/local-principal-sandbox/v1/protocol.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let localSandbox = false;
  try { localSandbox = isLocalPrincipalSandboxRequested(); }
  catch {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (localSandbox) {
    let runtime: Awaited<ReturnType<typeof getLocalSandboxPrincipalRuntime>> | null = null;
    let revokeFailed = false;
    try {
      runtime = await getLocalSandboxPrincipalRuntime();
      assertLocalSandboxRequest(request, runtime.config, { browserMutation: true, listenAddress: runtime.listenAddress });
      const token = principalSessionTokenFromRequest(request);
      if (token) {
        await principalRequestInput(token, request);
        const claims = verifyJenfuPrincipalSession(token, runtime.keyRing);
        const nativeSessionIdHash = runtime.ports.nativeSessionReadback.hashSessionId(claims.sessionId);
        const binding = await runtime.ports.binding.readByNativeSessionIdHash(nativeSessionIdHash);
        if (!binding || binding.status !== "central_registered" || binding.nativeSessionIdHash !== nativeSessionIdHash) {
          throw new Error("LOCAL_SANDBOX_BINDING_READBACK_FAILED");
        }
        const central = await runtime.client.revoke({ nativeSessionIdHash, reason: "ai-pdm-local-logout" });
        if (!central || central.revoked !== true) throw new Error("LOCAL_SANDBOX_CENTRAL_REVOKE_FAILED");
        try {
          await runtime.ports.binding.markRevoked({ registrationId: binding.registrationId, nativeSessionIdHash });
          const readback = await runtime.ports.binding.readByNativeSessionIdHash(nativeSessionIdHash);
          if (readback?.status !== "revoked") revokeFailed = true;
        } catch { revokeFailed = true; }
        try { await new JenfuPrincipalSessionRegistry(runtime.database).revoke(claims, "local_logout"); }
        catch { revokeFailed = true; }
        if (revokeFailed) throw new Error("LOCAL_SANDBOX_REVOKE_READBACK_FAILED");
      }
      const response = NextResponse.json({ status: "completed" }, { headers: { "cache-control": "no-store" } });
      response.headers.append("set-cookie", clearLocalPrincipalSessionCookie(runtime.config.sandboxId, runtime.config.origin));
      response.headers.append("set-cookie", createFirebaseHostingLogoutCookie());
      response.headers.append("set-cookie", createLogoutCookie());
      return response;
    } catch {
      const response = NextResponse.json({ code: "auth_server_not_configured" },
        { status: 503, headers: { "cache-control": "no-store" } });
      if (runtime) response.headers.append("set-cookie", clearLocalPrincipalSessionCookie(runtime.config.sandboxId, runtime.config.origin));
      return response;
    }
  }
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
