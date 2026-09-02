import { forbidden, getLegacySessionPayload, getSessionCookieToken, getSessionToken, unauthorized } from "@/lib/auth";
import { isAccountSessionActiveAsync, isAccountSessionRevokedAsync } from "@/lib/account-session-registry";
import { getAuthMode, getJenfuIdentityConfig, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUser } from "@/lib/db";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { resolveJenfuRouteAuthorization } from "@/lib/jenfu-route-permission-map";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import {
  JenfuPlatformAuthError,
  normalizeJenfuPlatformAuthError,
  verifyJenfuPlatformRequestSession
} from "@/lib/jenfu-platform-identity-contract";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import type { VerifiedJenfuAppSessionV1 } from "@/lib/jenfu-platform-session-v1";
import { hashPassword } from "@/lib/password";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";
import { AsyncAuthIdentityRepository, type ResolvedAuthIdentity } from "@/lib/repositories/auth-identity-async-repository";
import type { DbUserWithPassword } from "@/lib/repositories/user-repository";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

const demoPassword = "pdm-demo";

export type AsyncAuthResult =
  | { user: DbUser; session?: VerifiedJenfuAppSessionV1; response: null }
  | { user: null; response: Response };
export type AsyncRoleResult =
  | { user: DbUser; response: null; authorizationRoleCode?: string | null }
  | { user: DbUser; response: Response }
  | { user: null; response: Response };

export { forbidden };

export function getSessionUserId(request: Request): string | null {
  if (getAuthMode() === "firebase_bff") return null;
  return getLegacySessionPayload(request)?.userId ?? null;
}

function isSessionUserAllowed(user: DbUser | null, tokenCreatedAt: number) {
  if (!user || user.account_status !== "active") return false;
  if (user.system_role_enabled === 0 || user.system_role_enabled === false) return false;
  if (tokenCreatedAt > Date.now() + 5 * 60 * 1000) return false;
  const invalidBefore = user.session_invalid_before ? Date.parse(user.session_invalid_before) : Number.NaN;
  if (Number.isFinite(invalidBefore) && tokenCreatedAt <= invalidBefore) return false;
  return true;
}

async function requireJenfuSessionContext(request: Request) {
  const token = getSessionCookieToken(request);
  if (!token) throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  const client = getAsyncDatabaseClient();
  return verifyJenfuPlatformRequestSession({
    token,
    keyRing: getPlatformSessionKeyRing(),
    identityConfig: getJenfuIdentityConfig(),
    localUserRepository: new AsyncUserRepository(client),
    accountSessionRegistry: { isActive: isAccountSessionActiveAsync },
    principalAdmissionRepository: new JenfuPrincipalAdmissionRepository(client),
    authEpochRepository: new JenfuAuthEpochRepository(client)
  });
}

function jenfuAuthFailureResponse(error: unknown) {
  const normalized = normalizeJenfuPlatformAuthError(error);
  const messages: Partial<Record<typeof normalized.code, string>> = {
    auth_session_invalid: "登入工作階段無效或已失效。",
    auth_epoch_stale: "登入工作階段已由全域登出撤銷。",
    principal_not_active: "此帳號目前未啟用。",
    principal_ambiguous: "此帳號的員工對應需要管理員處理。",
    principal_directory_unavailable: "員工身分服務暫時無法使用。",
    auth_epoch_unavailable: "登入撤銷服務暫時無法使用。",
    auth_contract_mismatch: "登入契約版本不相容。",
    auth_server_not_configured: "平台登入尚未完成伺服器設定。"
  };
  return Response.json(
    { error: messages[normalized.code] ?? "登入驗證失敗。", code: normalized.code },
    { status: normalized.httpStatus, headers: { "cache-control": "no-store" } }
  );
}

export async function getSessionUserAsync(request: Request): Promise<DbUser | null> {
  if (getAuthMode() === "firebase_bff") {
    try {
      if (getJenfuPlatformAuthMode() === "on") return (await requireJenfuSessionContext(request)).user;
    } catch {
      return null;
    }
    const client = getAsyncDatabaseClient();
    const repository = new AsyncUserRepository(client);
    const token = getSessionToken(request);
    if (!token) return null;
    try {
      const keyRing = getPlatformSessionKeyRing();
      const initialClaims = verifyPlatformSessionV2(token, keyRing);
      const user = await repository.getUserById(initialClaims.pdmUserId);
      if (!user || user.company_id !== initialClaims.companyId) return null;
      if (await isAccountSessionRevokedAsync({ userId: user.id, sessionId: initialClaims.sessionId })) return null;
      verifyPlatformSessionV2(token, keyRing, {
        currentSessionVersion: Number(user.account_lifecycle_version ?? 1)
      });
      return user.account_status === "active" && user.system_role_enabled !== 0 && user.system_role_enabled !== false ? user : null;
    } catch {
      return null;
    }
  }

  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  const session = getLegacySessionPayload(request);
  if (!session) return null;
  const user = await repository.getUserById(session.userId);
  if (user && session.sessionId && (await isAccountSessionRevokedAsync({ userId: user.id, sessionId: session.sessionId }))) return null;
  return isSessionUserAllowed(user, session.createdAt) ? user : null;
}

export async function getUserByEmailWithPasswordAsync(email: string): Promise<DbUserWithPassword | null> {
  const identity = await getLocalPasswordIdentityAsync(email);
  return identity?.user ?? null;
}

export async function getLocalPasswordIdentityAsync(email: string): Promise<ResolvedAuthIdentity | null> {
  const client = getAsyncDatabaseClient();
  return new AsyncAuthIdentityRepository(client).resolveLocalPassword(email);
}

export async function getGoogleIdentityAsync(providerSubject: string): Promise<ResolvedAuthIdentity | null> {
  const client = getAsyncDatabaseClient();
  return new AsyncAuthIdentityRepository(client).resolveGoogle(providerSubject);
}

export async function recordIdentityLoginAsync(identityId: string, email?: string | null): Promise<void> {
  const client = getAsyncDatabaseClient();
  await new AsyncAuthIdentityRepository(client).recordSuccessfulLogin(identityId, email);
}

export async function getUserByIdAsync(userId: string): Promise<DbUser | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  return repository.getUserById(userId);
}

export async function createUserAsync(input: {
  displayName: string;
  email: string;
  passwordHash: string | null;
  role: DbUser["role"];
  companyCodes?: string[];
  id?: string;
}): Promise<string> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  return repository.createUser(input);
}

export async function updateUserPasswordAsync(userId: string, passwordHash: string): Promise<void> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  await repository.updateUserPassword(userId, passwordHash);
}

export async function ensureDemoUserAsync(input: {
  id: string;
  displayName: string;
  email: string;
  role: DbUser["role"];
  password?: string;
  companyCodes?: string[];
}): Promise<void> {
  if (getAuthMode() !== "demo") return;

  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  await repository.upsertUser({
    id: input.id,
    displayName: input.displayName,
    email: input.email,
    passwordHash: hashPassword(input.password ?? demoPassword),
    role: input.role,
    companyCodes: input.companyCodes ?? (input.role === "Admin" ? ["JENFU", "MAXIMA"] : ["JENFU"])
  });
  const storedUser = await repository.getUserByEmail(input.email);
  if (!storedUser) throw new Error("DEMO_USER_BOOTSTRAP_READBACK_FAILED");
  await repository.restoreDemoUserForLocalValidation(storedUser.id);
}

export async function requireAuthAsync(request: Request): Promise<AsyncAuthResult> {
  if (getAuthMode() === "firebase_bff") {
    try {
      if (getJenfuPlatformAuthMode() === "on") {
        const auth = await requireJenfuSessionContext(request);
        return { user: auth.user, session: auth.session, response: null };
      }
    } catch (error) {
      return { user: null, response: jenfuAuthFailureResponse(error) };
    }
  }
  const user = await getSessionUserAsync(request);
  if (!user) return { user: null, response: unauthorized() };
  return { user, response: null };
}

export type PdmRouteAuthorizationOptions = {
  permissionCode?: string;
  projectCode?: string | null;
  workspaceCode?: string | null;
};

function requestRoutePath(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/u, "") || "/";
  return `src/app${pathname}/route.ts`;
}

function requestProjectCode(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of ["projectCode", "project", "projectId"]) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function privilegedRoleCapabilityRoute(request: Request) {
  return new URL(request.url).pathname.startsWith("/api/settings/access/role-capabilities");
}

function routeAuthorization(request: Request, options: PdmRouteAuthorizationOptions) {
  if (options.permissionCode) return { authorizationMode: "permission" as const, permissionCode: options.permissionCode };
  if (privilegedRoleCapabilityRoute(request)) return { authorizationMode: "permission" as const, permissionCode: "settings.admin_matrix" };
  const entry = resolveJenfuRouteAuthorization(requestRoutePath(request), request.method);
  return entry ? { authorizationMode: entry.authorizationMode, permissionCode: entry.permissionCode } : null;
}

export async function requirePdmRouteAuthorizationAsync(
  request: Request,
  legacyRoles: DbUser["role"][] = [],
  options: PdmRouteAuthorizationOptions = {}
): Promise<AsyncRoleResult> {
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth;
  let entitlementMode: ReturnType<typeof getJenfuEntitlementMode>;
  try {
    entitlementMode = getJenfuEntitlementMode();
  } catch {
    return { user: auth.user, response: Response.json({ error: "ENTITLEMENT_MODE_INVALID" }, { status: 503 }) };
  }
  if (entitlementMode !== "enforce") {
    if (!legacyRoles.includes(auth.user.role)) return { user: auth.user, response: forbidden() };
    return { user: auth.user, response: null, authorizationRoleCode: auth.user.role === "Admin" ? "pdm_admin" : null };
  }
  if (!auth.session) return { user: auth.user, response: forbidden() };
  const policy = routeAuthorization(request, options);
  if (!policy) return { user: auth.user, response: forbidden() };
  if (policy.authorizationMode === "retired") {
    return { user: auth.user, response: Response.json({ error: "LEGACY_AUTHORIZATION_RETIRED" }, { status: 410 }) };
  }
  if (policy.authorizationMode !== "permission" || !policy.permissionCode) {
    return { user: auth.user, response: null };
  }
  const permission = await checkNumberingPermissionAsync({
    user: {
      ...auth.user,
      authorizationActor: {
        identityIssuer: auth.session.identityIssuer,
        identitySubject: auth.session.identitySubject,
        principalId: auth.session.principalId,
        employeeId: auth.session.employeeId
      }
    },
    permissionKind: "action",
    permissionCode: policy.permissionCode,
    workspaceCode: options.workspaceCode ?? auth.user.company_id,
    projectCode: options.projectCode ?? requestProjectCode(request)
  });
  if (!permission.allowed) return { user: auth.user, response: forbidden() };
  return { user: auth.user, response: null, authorizationRoleCode: permission.roleCode };
}
