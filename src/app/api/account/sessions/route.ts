import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { JenfuPrincipalSessionListRepository } from "@/lib/jenfu-principal-session-list-repository";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (!principalToken) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
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
