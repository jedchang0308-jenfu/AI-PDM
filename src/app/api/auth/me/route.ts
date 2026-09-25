import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { refreshRegisteredLegacySessionCookieAsync } from "@/lib/account-session-registry";
import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { resolvePrincipalCompanyContextInSnapshot, serializeAuthUserAsync } from "@/lib/company-context";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

export const runtime = "nodejs";

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
        const repository = new AsyncUserRepository(snapshot);
        const profile = await repository.getUserById(verified.profile.pdmUserId);
        if (!profile || profile.id !== verified.profile.pdmUserId ||
            profile.company_id !== verified.profile.companyId) {
          throw new JenfuPrincipalRequestError("auth_session_invalid");
        }
        const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified, { state: "absent" });
        if (companyResult.response) throw new JenfuPrincipalRequestError("auth_session_invalid");
        const companyAccess = { ...companyResult.company, is_default: true };
        // The historical profile role is never returned as a principal capability.
        return NextResponse.json({
          user: { id: profile.id, display_name: profile.display_name, email: profile.email,
            role: null, default_company: companyAccess, companies: [companyAccess] },
          session: verified.session
        }, { headers: { "cache-control": "no-store" } });
      });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  if (getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on" && auth.session) {
    return NextResponse.json(
      { user: await serializeAuthUserAsync(user), session: auth.session },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const headers = hasSessionCookie(request) && getAuthMode() !== "firebase_bff"
    ? { "set-cookie": await refreshRegisteredLegacySessionCookieAsync({ request, user }) }
    : undefined;
  return NextResponse.json({ user: await serializeAuthUserAsync(user) }, { headers });
}

function hasSessionCookie(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .some((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE_NAME}=`)) ?? false
  );
}
