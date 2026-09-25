import { NextResponse } from "next/server";
import { listAccountSessionsAsync, touchAccountSessionAsync } from "@/lib/account-session-registry";
import { getLegacySessionPayload, getSessionToken } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { JenfuPrincipalSessionListRepository } from "@/lib/jenfu-principal-session-list-repository";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
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

export async function GET(request: Request) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
        return NextResponse.json({ code: "principal_authorization_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(principalToken), async (snapshot, verified) => {
        const sessions = await new JenfuPrincipalSessionListRepository(snapshot).list(
          verified.session.principalId, hashJenfuPrincipalSessionId(verified.session.sessionId));
        return NextResponse.json({ sessions }, { headers: { "cache-control": "no-store" } });
      });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  const sessionId = currentSessionId(request);
  if (sessionId) await touchAccountSessionAsync({ userId: auth.user.id, sessionId });
  const sessions = await listAccountSessionsAsync({
    userId: auth.user.id,
    currentSessionId: sessionId,
    limit: 20
  });
  return NextResponse.json({ sessions }, { headers: { "cache-control": "no-store" } });
}
