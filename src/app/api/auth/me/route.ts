import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

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
