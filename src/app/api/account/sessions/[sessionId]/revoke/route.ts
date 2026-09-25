import { NextResponse } from "next/server";
import { AccountSessionError, revokeAccountSessionRecordAsync } from "@/lib/account-session-registry";
import { getLegacySessionPayload, getSessionToken } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { hashJenfuPrincipalSessionId, JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
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

function sessionError(error: unknown) {
  if (error instanceof AccountSessionError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "session_revoke_failed", message: "工作階段撤銷失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
        return NextResponse.json({ code: "principal_authorization_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      if (!isAllowedRequestOrigin(request)) {
        return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
      }
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return NextResponse.json({ error: "json_body_required" }, { status: 415 });
      }
      const length = Number(request.headers.get("content-length") ?? "0");
      if (!Number.isFinite(length) || length < 0 || length > 8 * 1024) {
        return NextResponse.json({ error: "request_too_large" }, { status: 413 });
      }
      const { sessionId } = await params;
      const body = await request.json().catch(() => ({}));
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!/^[0-9a-f]{64}$/u.test(sessionId) || reason.length < 1 || reason.length > 500) {
        return NextResponse.json({ error: "invalid_session_revoke" }, { status: 400 });
      }
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(principalToken), async (snapshot, verified) => {
        if (sessionId === hashJenfuPrincipalSessionId(verified.session.sessionId)) {
          return NextResponse.json({ error: "current_session_requires_logout" }, { status: 409 });
        }
        const revoked = await new JenfuPrincipalSessionRegistry(snapshot).revokeOther({
          principalId: verified.session.principalId, recordId: sessionId,
          currentSessionId: verified.session.sessionId, reason
        });
        return revoked
          ? NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
          : NextResponse.json({ error: "session_not_found" }, { status: 404 });
      }, { readOnly: false });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin", message: "要求來源不正確。" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_body_required", message: "要求格式不正確。" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 8 * 1024) {
    return NextResponse.json({ error: "request_too_large", message: "要求內容過大。" }, { status: 413 });
  }

  const { sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await revokeAccountSessionRecordAsync({
      actorId: auth.user.id,
      userId: auth.user.id,
      recordId: sessionId,
      currentSessionId: currentSessionId(request),
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return sessionError(error);
  }
}
