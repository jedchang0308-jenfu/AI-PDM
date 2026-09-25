import { requireAuthAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissions } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { checkNumberingPermissionsAsync } from "@/lib/numbering-permission-async";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { numberingUserScopeFromVerifiedSession } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
        return Response.json({ code: "principal_authorization_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      const results = await evaluatePrincipalWorkspacePermissions({
        ...principalRequestInput(principalToken),
        permissions: [
          ...NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode) => ({ permissionKind: "page" as const, permissionCode })),
          ...NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode) => ({ permissionKind: "action" as const, permissionCode }))
        ]
      });
      if (results.length !== NUMBERING_PAGE_PERMISSION_CODES.length + NUMBERING_ACTION_PERMISSION_CODES.length) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      const pages = Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode, index) =>
        [permissionCode, results[index]?.allowed === true]));
      const offset = NUMBERING_PAGE_PERMISSION_CODES.length;
      const actions = Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode, index) =>
        [permissionCode, results[offset + index]?.allowed === true]));
      return numberStateFlowJson({ generatedAt: new Date().toISOString(), pages, actions });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const user = numberingUserScopeFromVerifiedSession(auth.user, auth.session);
  const inputs = [
    ...NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode) => ({ user, permissionKind: "page" as const, permissionCode, workspaceCode: user.company_id })),
    ...NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode) => ({ user, permissionKind: "action" as const, permissionCode, workspaceCode: user.company_id }))
  ];
  const results = await checkNumberingPermissionsAsync(inputs);
  const pages = Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map((permissionCode, index) => [permissionCode, results[index]?.allowed ?? false]));
  const actionsOffset = NUMBERING_PAGE_PERMISSION_CODES.length;
  const actions = Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map((permissionCode, index) => [permissionCode, results[actionsOffset + index]?.allowed ?? false]));

  return numberStateFlowJson({
    generatedAt: new Date().toISOString(),
    pages,
    actions
  });
}
