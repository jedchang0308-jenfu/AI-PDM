import { forbidden, requireAuth } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { checkNumberingPermission, type NumberingPermissionCheckResult, type NumberingPermissionKind, type NumberingUserScope } from "@/lib/db";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";

export type NumberingPermissionResourceScope = {
  workspaceCode: string | null;
  projectCode: string | null;
};

export function resolveNumberingPermissionResourceScope(
  request: Request,
  options: { workspaceCode?: string | null; projectCode?: string | null } = {},
  workspaceFallback: string | null = null
): NumberingPermissionResourceScope {
  const params = new URL(request.url).searchParams;
  let projectCode = options.projectCode;
  if (projectCode === undefined) {
    projectCode = null;
    for (const key of ["projectCode", "project", "projectId"]) {
      const value = params.get(key)?.trim();
      if (value) {
        projectCode = value;
        break;
      }
    }
  }
  return {
    workspaceCode: options.workspaceCode === undefined ? workspaceFallback : options.workspaceCode,
    projectCode
  };
}

export type NumberingGuardResult = {
  user: NumberingUserScope;
  response: Response | null;
  permission: NumberingPermissionCheckResult | null;
};

export function requireNumberingPermission(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
): NumberingGuardResult {
  const auth = requireAuth(request);
  if (!auth.user) return { user: { id: "", role: "" }, response: auth.response, permission: null };
  const scope = resolveNumberingPermissionResourceScope(request, options, auth.user.company_id);

  const permission = checkNumberingPermission({
    user: auth.user,
    permissionKind,
    permissionCode,
    workspaceCode: scope.workspaceCode,
    projectCode: scope.projectCode,
    actionCode: options.actionCode
  });
  if (!permission.allowed) return { user: auth.user, response: forbidden(), permission };
  return { user: auth.user, response: null, permission };
}

export async function requireNumberingPermissionAsync(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
): Promise<NumberingGuardResult> {
  const auth = await requireAuthAsync(request);
  if (!auth.user) return { user: { id: "", role: "" }, response: auth.response, permission: null };
  const scope = resolveNumberingPermissionResourceScope(request, options, auth.user.company_id);

  const permission = await checkNumberingPermissionAsync({
    user: {
      ...auth.user,
      authorizationActor: auth.session ? {
        identityIssuer: auth.session.identityIssuer,
        identitySubject: auth.session.identitySubject,
        principalId: auth.session.principalId,
        employeeId: auth.session.employeeId
      } : undefined
    },
    permissionKind,
    permissionCode,
    workspaceCode: scope.workspaceCode,
    projectCode: scope.projectCode,
    actionCode: options.actionCode
  });
  if (!permission.allowed) return { user: auth.user, response: jenfuEntitlementFailureResponse(permission.decisionCode), permission };
  return { user: auth.user, response: null, permission };
}

export function requireNumberingPage(
  request: Request,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
) {
  return requireNumberingPermission(request, "page", permissionCode, options);
}

export function requireNumberingPageAsync(
  request: Request,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
) {
  return requireNumberingPermissionAsync(request, "page", permissionCode, options);
}

export function requireNumberingAction(
  request: Request,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
) {
  return requireNumberingPermission(request, "action", permissionCode, options);
}

export function requireNumberingActionAsync(
  request: Request,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
) {
  return requireNumberingPermissionAsync(request, "action", permissionCode, options);
}

export function canUserUseNumberingAction(
  user: NumberingUserScope,
  permissionCode: string,
  options: { projectCode?: string | null; actionCode?: string | null } = {}
) {
  return checkNumberingPermission({
    user,
    permissionKind: "action",
    permissionCode,
    projectCode: options.projectCode,
    actionCode: options.actionCode
  });
}

export function canUserUseNumberingActionAsync(
  user: NumberingUserScope,
  permissionCode: string,
  options: { projectCode?: string | null; actionCode?: string | null } = {}
) {
  return checkNumberingPermissionAsync({
    user,
    permissionKind: "action",
    permissionCode,
    projectCode: options.projectCode,
    actionCode: options.actionCode
  });
}
