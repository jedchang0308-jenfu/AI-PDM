import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import { resolveLegacyDrawingLifecycleNavigation } from "@/lib/approval-workbench-legacy-redirect";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import { AsyncSubmissionStatusRepository } from "@/lib/repositories/submission-status-async-repository";

export const runtime = "nodejs";

function principalSubmissionDenied(code: string) {
  const response = jenfuEntitlementFailureResponse(code);
  response.headers.set("x-jenfu-principal-historical", "1");
  return response;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token || (getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on")) {
    const path = "src/app/api/submissions/[id]/route.ts";
    const policy = resolveJenfuRoutePolicy(path, "GET", { expectedPermissionCode: "submission.view" });
    if (policy?.path !== path || policy.authorizationMode !== "permission" ||
        policy.scopeResolver !== "submission company") {
      return NextResponse.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!token) return NextResponse.json({ code: "auth_session_invalid" },
      { status: 401, headers: { "cache-control": "no-store" } });
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
      return NextResponse.json({ code: "principal_authorization_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    try {
      const { id } = await params;
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
        const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: "submission.view" }]);
        if (!decision || decision.permissionCode !== "submission.view" ||
            decision.principalId !== verified.session.principalId) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        if (!decision.allowed) return principalSubmissionDenied(decision.decisionCode);
        const role = decision.roleCode;
        if (role !== "rd" && role !== "rd_manager" && role !== "pdm_admin" && role !== "system_admin") {
          return NextResponse.json({ code: "principal_route_policy_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        const resource = await snapshot.queryOne<{ company_id: string; submitted_by: string }>(
          "SELECT company_id, submitted_by FROM ai_pdm_core.submissions WHERE id=:id", { id });
        if (!resource || !resource.company_id || resource.company_id !== verified.profile.companyId) {
          return NextResponse.json({ error: "submission_not_found" }, { status: 404 });
        }
        if (role === "rd" && resource.submitted_by !== verified.profile.pdmUserId) {
          return principalSubmissionDenied("permission_not_granted");
        }
        if (role !== "rd" && verified.session.assuranceLevel !== "aal2") {
          return principalSubmissionDenied("assurance_insufficient");
        }
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
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const lifecycle = await resolveLegacyDrawingLifecycleNavigation({
    submissionId: id,
    actorId: auth.user.id,
    companyId: auth.user.company_id
  });
  if (lifecycle) {
    return NextResponse.json(
      {
        error: "DRAWING_LIFECYCLE_LEGACY_VIEW_DISABLED",
        code: "DRAWING_LIFECYCLE_LEGACY_VIEW_DISABLED",
        canonicalHref: lifecycle.canonicalHref
      },
      { status: 410 }
    );
  }
  const submission = await getSubmissionAsync(id);
  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) {
    return forbidden();
  }
  return NextResponse.json({ submission });
}

