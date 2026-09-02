import { forbidden, requireAuth } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { checkNumberingPermission, type NumberingPermissionCheckResult, type NumberingPermissionKind, type NumberingUserScope } from "@/lib/db";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";

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

  const permission = checkNumberingPermission({
    user: auth.user,
    permissionKind,
    permissionCode,
    workspaceCode: options.workspaceCode,
    projectCode: options.projectCode,
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
    workspaceCode: options.workspaceCode,
    projectCode: options.projectCode,
    actionCode: options.actionCode
  });
  if (!permission.allowed) return { user: auth.user, response: forbidden(), permission };
  return { user: auth.user, response: null, permission };
}

export function requireNumberingPage(request: Request, permissionCode: string) {
  return requireNumberingPermission(request, "page", permissionCode);
}

export function requireNumberingPageAsync(request: Request, permissionCode: string) {
  return requireNumberingPermissionAsync(request, "page", permissionCode);
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
