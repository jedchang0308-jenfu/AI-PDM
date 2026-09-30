import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";
import type { ReleasePackage } from "@/lib/types";
import { deliverPrincipalReleasePackage } from "@/lib/principal-release-package-delivery";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const path = "src/app/api/submissions/[id]/release-package/route.ts";
  const policy = resolveJenfuRoutePolicy(path, "GET", { expectedPermissionCode: "submission.view" });
  if (policy?.path !== path || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "submission company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { id } = await params;
  try {
    const authorized = await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      async (snapshot, verified) => {
        const resource = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, id);
        if (resource instanceof Response) return resource;
        const submission = await snapshot.queryOne<{ status: string }>(
          "SELECT status FROM ai_pdm_core.submissions WHERE id=:id", { id });
        if (!submission) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        if (submission.status !== "Released" && submission.status !== "Obsolete") {
          return NextResponse.json({ error: "Only Released or Obsolete submissions can download release packages" },
            { status: 409 });
        }
        const releasePackage = await snapshot.queryOne<ReleasePackage>(
          "SELECT * FROM ai_pdm_core.release_packages WHERE submission_id=:id", { id });
        if (!releasePackage) return NextResponse.json({ error: "Release package not found" }, { status: 404 });
        if (releasePackage.submission_id !== id) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        return { releasePackage, principalId: verified.session.principalId,
          profileId: verified.profile.pdmUserId, companyId: resource.company_id };
      });
    if (authorized instanceof Response) return authorized;
    return await deliverPrincipalReleasePackage(request, id,
      "/api/submissions/[id]/release-package", authorized);
  } catch (error) { return principalRequestFailure(error); }
}

