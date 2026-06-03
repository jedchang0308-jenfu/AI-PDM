import { forbidden, requireAuth } from "@/lib/auth";
import { checkNumberingPermission, type NumberingPermissionCheckResult, type NumberingPermissionKind, type NumberingUserScope } from "@/lib/db";

export type NumberingGuardResult = {
  user: NumberingUserScope;
  response: Response | null;
  permission: NumberingPermissionCheckResult | null;
};

export function requireNumberingPermission(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string,
  options: { projectCode?: string | null; actionCode?: string | null } = {}
): NumberingGuardResult {
  const auth = requireAuth(request);
  if (!auth.user) return { user: { id: "", role: "" }, response: auth.response, permission: null };

  const permission = checkNumberingPermission({
    user: auth.user,
    permissionKind,
    permissionCode,
    projectCode: options.projectCode,
    actionCode: options.actionCode
  });
  if (!permission.allowed) return { user: auth.user, response: forbidden(), permission };
  return { user: auth.user, response: null, permission };
}

export function requireNumberingPage(request: Request, permissionCode: string) {
  return requireNumberingPermission(request, "page", permissionCode);
}

export function requireNumberingAction(
  request: Request,
  permissionCode: string,
  options: { projectCode?: string | null; actionCode?: string | null } = {}
) {
  return requireNumberingPermission(request, "action", permissionCode, options);
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
