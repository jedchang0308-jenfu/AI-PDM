import { forbidden, requireAuth } from "@/lib/auth";
import { requireAuthAsync } from "@/lib/auth-async";
import { checkNumberingPermission, type NumberingPermissionCheckResult, type NumberingPermissionKind, type NumberingUserScope } from "@/lib/db";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import type { VerifiedJenfuAppSessionV1 } from "@/lib/jenfu-platform-session-v1";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";
import { resolvePrincipalCompanyContextInSnapshot, type PdmCompanyContext, type PdmCompanyRequest } from "@/lib/company-context";

export type NumberingPermissionResourceScope = {
  workspaceCode: string | null;
  projectCode: string | null;
};

export function resolveNumberingPermissionResourceScope(
  _request: Request,
  options: { workspaceCode?: string | null; projectCode?: string | null } = {},
  workspaceFallback: string | null = null
): NumberingPermissionResourceScope {
  return {
    workspaceCode: options.workspaceCode === undefined ? workspaceFallback : options.workspaceCode,
    projectCode: options.projectCode ?? null
  };
}

export type NumberingGuardResult = {
  user: NumberingUserScope;
  response: Response | null;
  permission: NumberingPermissionCheckResult | null;
  company?: PdmCompanyContext | null;
};

/** Carries verified identity only in process; keep principal identifiers out of serialized API responses. */
export function numberingUserScopeWithVerifiedActor(user: NumberingGuardResult["user"], actor: NumberingGuardResult["user"]["authorizationActor"]) {
  const scoped = { ...user };
  if (actor) Object.defineProperty(scoped, "authorizationActor", { value: actor, enumerable: false });
  return scoped;
}

export function numberingUserScopeFromVerifiedSession(
  user: NumberingGuardResult["user"],
  session?: VerifiedJenfuAppSessionV1
) {
  const actor = session && user.company_id ? createJenfuVerifiedAuthorizationActor({
    identityIssuer: session.identityIssuer,
    identitySubject: session.identitySubject,
    principalId: session.principalId,
    employeeId: session.employeeId,
    localPrincipalId: user.id,
    companyId: user.company_id
  }) : null;
  return numberingUserScopeWithVerifiedActor(user, actor ?? undefined);
}

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

/** Use only from a route whose downstream company and resource predicates are principal-aware. */
export async function requirePrincipalNumberingPermissionAsync(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string,
  requestedCompany: PdmCompanyRequest,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
): Promise<NumberingGuardResult> {
  const principalToken = principalSessionTokenFromRequest(request);
  if (!principalToken) {
    return { user: { id: "", role: "" }, permission: null,
      response: Response.json({ code: "auth_session_invalid" },
        { status: 401, headers: { "cache-control": "no-store" } }) };
  }
  try {
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
      return { user: { id: "", role: "" }, permission: null,
        response: Response.json({ code: "principal_authorization_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } }) };
    }
    const result = await withVerifiedJenfuPrincipalRequest(principalRequestInput(principalToken), async (snapshot, verified) => {
      const user = await new AsyncUserRepository(snapshot).getUserById(verified.profile.pdmUserId);
      if (!user || user.id !== verified.profile.pdmUserId ||
          user.company_id !== verified.profile.companyId) {
        throw new JenfuPrincipalRequestError("auth_session_invalid");
      }
      const actor = createJenfuVerifiedAuthorizationActor({
        identityIssuer: verified.session.identityIssuer,
        identitySubject: verified.session.identitySubject,
        principalId: verified.session.principalId,
        employeeId: verified.session.employeeId,
        localPrincipalId: user.id,
        companyId: verified.profile.companyId,
        sessionSchemaVersion: 2
      });
      if (!actor) throw new JenfuPrincipalRequestError("auth_session_invalid");
      // The persisted profile role is historical domain data. Never pass it
      // to downstream v2 business checks as an authorization shortcut.
      const permissionUser = numberingUserScopeWithVerifiedActor({ ...user, role: "Principal" }, actor);
      const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified, requestedCompany);
      if (companyResult.response) {
        return { user: permissionUser, permission: null, company: null,
          response: companyResult.response } satisfies NumberingGuardResult;
      }
      // A route's caller-provided project/action is not proof of the resource.
      // Resource-scoped decisions need a dedicated server-side adapter.
      if ((options.workspaceCode !== undefined && options.workspaceCode !== companyResult.company.companyId) ||
          options.projectCode != null || options.actionCode != null) {
        const permission = {
          allowed: false, permissionKind, permissionCode, roleCode: null,
          evaluatedRoles: [], reason: "no_candidate_role" as const,
          decisionCode: "entitlement_scope_mismatch"
        };
        return { user: permissionUser, company: companyResult.company, permission,
          response: jenfuEntitlementFailureResponse(permission.decisionCode) } satisfies NumberingGuardResult;
      }
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified, [
        { permissionKind, permissionCode }
      ]);
      if (decisions.length !== 1 || !decisions[0] || decisions[0].principalId !== actor.principalId) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      const decision = decisions[0];
      const permission = {
        allowed: decision.allowed, permissionKind, permissionCode,
        roleCode: decision.roleCode,
        evaluatedRoles: decision.roleCode ? [decision.roleCode] : [],
        reason: decision.decisionCode === "permission_explicit_deny" ? "explicit" as const :
          decision.allowed ? "explicit" as const : "no_candidate_role" as const,
        decisionCode: decision.decisionCode
      };
      return { user: permissionUser, company: companyResult.company, permission,
        response: decision.allowed ? null : jenfuEntitlementFailureResponse(decision.decisionCode) } satisfies NumberingGuardResult;
    });
    return result;
  } catch (error) {
    return { user: { id: "", role: "" }, permission: null, response: principalRequestFailure(error) };
  }
}

export async function requireNumberingPermissionAsync(
  request: Request,
  permissionKind: NumberingPermissionKind,
  permissionCode: string,
  options: { workspaceCode?: string | null; projectCode?: string | null; actionCode?: string | null } = {}
): Promise<NumberingGuardResult> {
  // Each v2 route must explicitly adopt its principal-aware domain/resource
  // predicates. An old route must never receive a v2 actor plus legacy checks.
  if (principalSessionTokenFromRequest(request)) {
    return { user: { id: "", role: "" }, permission: null,
      response: Response.json({ code: "principal_route_not_migrated" },
        { status: 503, headers: { "cache-control": "no-store" } }) };
  }
  const auth = await requireAuthAsync(request);
  if (!auth.user) return { user: { id: "", role: "" }, response: auth.response, permission: null };
  const scope = resolveNumberingPermissionResourceScope(request, options, auth.user.company_id);
  const permissionUser = numberingUserScopeFromVerifiedSession(auth.user, auth.session);

  const permission = await checkNumberingPermissionAsync({
    user: permissionUser,
    permissionKind,
    permissionCode,
    workspaceCode: scope.workspaceCode,
    projectCode: scope.projectCode,
    actionCode: options.actionCode
  });
  if (!permission.allowed) return { user: permissionUser, response: jenfuEntitlementFailureResponse(permission.decisionCode), permission };
  return { user: permissionUser, response: null, permission };
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
