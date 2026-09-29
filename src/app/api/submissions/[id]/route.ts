import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import { AsyncSubmissionStatusRepository } from "@/lib/repositories/submission-status-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const path = "src/app/api/submissions/[id]/route.ts";
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
  try {
    const { id } = await params;
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
      const resource = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, id);
      if (resource instanceof Response) return resource;
      const submission = await new AsyncSubmissionListRepository(snapshot).getSubmission(id);
      if (!submission || submission.company_id !== resource.company_id ||
          submission.submitted_by !== resource.submitted_by) {
        return NextResponse.json({ code: "principal_dependency_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      return NextResponse.json({ submission: {
        ...submission,
        release_actionability: await new AsyncSubmissionStatusRepository(snapshot)
          .getSubmissionReleaseActionability({ id })
      }, historicalReadOnly: true }, { headers: { "cache-control": "private, no-store" } });
    });
  } catch (error) { return principalRequestFailure(error); }
}

