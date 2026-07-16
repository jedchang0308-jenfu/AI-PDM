import { forbidden, getLegacySessionPayload, getSessionToken, unauthorized } from "@/lib/auth";
import { isAccountSessionRevokedAsync } from "@/lib/account-session-registry";
import { getAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUser } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { verifyPlatformSessionV2 } from "@/lib/platform-session-v2";
import { getPrivacyAcknowledgementStatusAsync, isPrivacyNoticeEnforced } from "@/lib/privacy-notice";
import { AsyncAuthIdentityRepository, type ResolvedAuthIdentity } from "@/lib/repositories/auth-identity-async-repository";
import type { DbUserWithPassword } from "@/lib/repositories/user-repository";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

const demoPassword = "pdm-demo";

export type AsyncAuthResult = { user: DbUser; response: null } | { user: null; response: Response };
export type AsyncRoleResult =
  | { user: DbUser; response: null }
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

export async function getSessionUserAsync(request: Request): Promise<DbUser | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  if (getAuthMode() === "firebase_bff") {
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
}

export async function requireAuthAsync(request: Request): Promise<AsyncAuthResult> {
  const user = await getSessionUserAsync(request);
  if (!user) return { user: null, response: unauthorized() };
  if (isPrivacyNoticeEnforced()) {
    try {
      const privacy = await getPrivacyAcknowledgementStatusAsync({ userId: user.id, companyId: user.company_id });
      if (privacy.status !== "acknowledged") {
        return {
          user: null,
          response: Response.json(
            {
              error: "privacy_acknowledgement_required",
              message: "請先閱讀並確認目前版本的員工個人資料告知事項。",
              acknowledgementUrl: "/privacy/acknowledgement"
            },
            { status: 428, headers: { "cache-control": "no-store" } }
          )
        };
      }
    } catch {
      return {
        user: null,
        response: Response.json(
          { error: "privacy_gate_unavailable", message: "隱私確認狀態暫時無法驗證，請稍後重試或聯絡系統管理員。" },
          { status: 503, headers: { "cache-control": "no-store" } }
        )
      };
    }
  }
  return { user, response: null };
}

export async function requireRoleAsync(
  request: Request,
  roles: DbUser["role"][]
): Promise<AsyncRoleResult> {
  const auth = await requireAuthAsync(request);
  if (auth.response || !auth.user) return auth;
  if (!roles.includes(auth.user.role)) return { user: auth.user, response: forbidden() };
  return { user: auth.user, response: null };
}
