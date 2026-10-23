import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalResourcePermissionsInSnapshot, evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { resolveJenfuRouteAuthorization, resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncReleaseRepository } from "@/lib/repositories/release-async-repository";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";
import type { ReadonlyShare, SubmissionDetail } from "@/lib/types";
import { hashShareTokenAsync } from "@/lib/readonly-share-async";
import { authorizeSubmissionOriginalsInSnapshot } from '@/lib/principal-submission-file-capability';

export type PrincipalShareRequest = { snapshot: AsyncDatabaseClient; verified: VerifiedPrincipalRequest };
export type PrincipalShareSubmission = { id: string; company_id: string; submitted_by: string; status: string };
export type ExternalProjectReadContext = {
  principalId: string; companyId: string; originalAssignmentId: string; projectScopeKey: string;
  shareId: string; submissionId: string; releasePackageId: string; releasePackageSha256: string; decisionAt: string;
};

function principalModeReady() {
  return getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on" &&
    getJenfuEntitlementMode() === "enforce";
}

function routePolicyFailure() {
  return Response.json({ code: "principal_route_policy_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}

export async function withPrincipalSharePermission<T>(
  request: Request,
  routePath: string,
  permissionCode: "submission.view" | "submission.share",
  evaluate: (context: PrincipalShareRequest) => Promise<T>,
  options: { readOnly?: boolean } = {}
): Promise<T | Response> {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRoutePolicy(routePath, request.method, { expectedPermissionCode: permissionCode });
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" ||
      policy.permissionCode !== permissionCode || policy.scopeResolver !== "submission company") {
    return routePolicyFailure();
  }
  if (!principalModeReady()) {
    return Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      (snapshot, verified) => evaluate({ snapshot, verified }), { readOnly: options.readOnly !== false });
  } catch (error) {
    return principalRequestFailure(error);
  }
}

/** A Principal proves identity here; no supplier-reply permission has been published. */
export async function withPrincipalIdentityOnlyShareRoute<T>(
  request: Request,
  routePath: string,
  evaluate: (context: PrincipalShareRequest) => Promise<T>
): Promise<T | Response> {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRouteAuthorization(routePath, request.method);
  if (policy?.path !== routePath || policy.authorizationMode !== "authenticated_domain" ||
      policy.permissionCode !== null) return routePolicyFailure();
  if (!principalModeReady()) {
    return Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      (snapshot, verified) => evaluate({ snapshot, verified }));
  } catch (error) {
    return principalRequestFailure(error);
  }
}

export async function authorizePrincipalSubmissionShareInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  submissionId: string
): Promise<Response | PrincipalShareSubmission> {
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    [{ permissionKind: "action", permissionCode: "submission.share" }]);
  const decision = decisions[0];
  if (decisions.length !== 1 || !decision || decision.permissionCode !== "submission.share" ||
      decision.principalId !== verified.session.principalId) {
    return Response.json({ code: "principal_dependency_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!decision.allowed) return jenfuEntitlementFailureResponse(decision.decisionCode);
  const submission = await snapshot.queryOne<PrincipalShareSubmission>(
    `SELECT id,company_id,submitted_by,status FROM ai_pdm_core.submissions WHERE id=:submissionId`,
    { submissionId });
  if (!submission || submission.company_id !== verified.profile.companyId) {
    return Response.json({ error: "submission_not_found" }, { status: 404 });
  }
  return submission;
}

export async function getAuthorizedPublicShareInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  token: string,
  options: { download?: boolean } = {}
): Promise<Response | { share: ReadonlyShare; submission: SubmissionDetail; externalProjectContext?: ExternalProjectReadContext }> {
  if (!/^[A-Za-z0-9_-]{24,128}$/u.test(token.trim())) {
    return Response.json({ error: "找不到分享連結" }, { status: 404 });
  }
  const share = await new AsyncReleaseRepository(snapshot)
    .getReadonlyShareByTokenHash(hashShareTokenAsync(token.trim()));
  if (!share || share.status !== "active") return Response.json({ error: "找不到分享連結" }, { status: 404 });
  const resource = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, share.submission_id, { shareId: share.id });
  if (resource instanceof Response) return resource;
  const submission = await new AsyncSubmissionListRepository(snapshot).getSubmission(share.submission_id);
  if (!submission || submission.company_id !== resource.company_id ||
      submission.status !== "Released" || !submission.release_package ||
      !share.project_scope_key || share.project_scope_key !== resource.project_code.trim()) {
    return Response.json({ error: "找不到分享連結" }, { status: 404 });
  }
  if (options.download) {
    const originalsFailure = await authorizeSubmissionOriginalsInSnapshot(snapshot, verified,
      submission.id, undefined, submission.release_package.manifest_json);
    if (originalsFailure) return originalsFailure;
    const catalog = await requirePublishedPrincipalCatalog(snapshot);
    if (catalog.catalogVersion.startsWith("ai-pdm.role-policy.")) {
      const decisions = await evaluatePrincipalResourcePermissionsInSnapshot(snapshot, verified,
        [{ permissionKind: "action", permissionCode: "pdm.transfer.download" }],
        { workspaceCode: verified.profile.companyId, projectCode: resource.project_code.trim() });
      if (decisions.length !== 1 || !decisions[0]?.allowed ||
          decisions[0].permissionCode !== "pdm.transfer.download" ||
          decisions[0].principalId !== verified.session.principalId) {
        return jenfuEntitlementFailureResponse("permission_not_granted");
      }
    }
  }
  let externalProjectContext: ExternalProjectReadContext | undefined;
  if (resource.externalAssignmentId) {
    const clock = await snapshot.queryOne<{ decision_at: string }>('SELECT transaction_timestamp()::text AS decision_at');
    if (!clock?.decision_at || !Number.isFinite(Date.parse(clock.decision_at)) ||
        submission.release_package.submission_id !== submission.id || !/^[a-f0-9]{64}$/iu.test(submission.release_package.sha256)) {
      return Response.json({ code: 'principal_dependency_unavailable' },
        { status: 503, headers: { 'cache-control': 'private, no-store' } });
    }
    externalProjectContext = { principalId: verified.session.principalId, companyId: resource.company_id,
      originalAssignmentId: resource.externalAssignmentId, projectScopeKey: resource.project_code.trim(),
      shareId: share.id, submissionId: submission.id, releasePackageId: submission.release_package.id,
      releasePackageSha256: submission.release_package.sha256, decisionAt: clock.decision_at };
  }
  await new AsyncReleaseRepository(snapshot).recordReadonlyShareAccess({
    shareId: share.id, submissionId: submission.id
  });
  return { share, submission, ...(externalProjectContext ? { externalProjectContext } : {}) };
}
