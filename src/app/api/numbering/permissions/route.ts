import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissions } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { SHARED_REVIEW_ENTRY_PERMISSIONS, sharedReviewEntryAccess } from "@/lib/approval-workbench-contract";
import { principalPermissionSnapshotsEnabled } from "@/lib/principal-session-permission-snapshot";
import { numberStateFlowJson } from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (!principalToken) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  try {
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
      return Response.json({ code: "principal_authorization_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const reviewPermissions = principalPermissionSnapshotsEnabled() ? SHARED_REVIEW_ENTRY_PERMISSIONS : [];
    const results = await evaluatePrincipalWorkspacePermissions({
      ...(await principalRequestInput(principalToken, request)),
      permissions: [
        ...NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode) => ({ permissionKind: "page" as const, permissionCode })),
        ...NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode) => ({ permissionKind: "action" as const, permissionCode })),
        ...reviewPermissions
      ]
    });
    const existingPermissionCount = NUMBERING_PAGE_PERMISSION_CODES.length + NUMBERING_ACTION_PERMISSION_CODES.length;
    if (results.length !== existingPermissionCount + reviewPermissions.length) {
      throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
    }
    const pages = Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode, index) =>
      [permissionCode, results[index]?.allowed === true]));
    const offset = NUMBERING_PAGE_PERMISSION_CODES.length;
    const actions = Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode, index) =>
      [permissionCode, results[offset + index]?.allowed === true]));
    const sharedReview = sharedReviewEntryAccess(results.slice(existingPermissionCount));
    actions["approval.inbox.view"] ||= sharedReview.drawing || sharedReview.part || sharedReview.transfer;
    return numberStateFlowJson({ contractVersion: "ai-pdm.frontend-permission-projection.v1",
      applicationId: "ai-pdm", generatedAt: new Date().toISOString(), pages, actions });
  } catch (error) {
    return principalRequestFailure(error);
  }
}
