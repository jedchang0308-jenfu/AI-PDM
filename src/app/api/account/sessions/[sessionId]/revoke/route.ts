import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { hashJenfuPrincipalSessionId, JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (!principalToken) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
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
