import crypto from "node:crypto";
import { SESSION_COOKIE_NAME, forbidden, unauthorized } from "@/lib/auth";
import { getAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUser } from "@/lib/db";
import { hashPassword } from "@/lib/password";
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

function getAuthSecret() {
  return process.env.PDM_AUTH_SECRET || "dev-only-change-before-production";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

function parseCookies(header: string | null) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies.set(rawName, rawValue.join("="));
  }
  return cookies;
}

function getSessionToken(request: Request) {
  const cookieToken = parseCookies(request.headers.get("cookie")).get(SESSION_COOKIE_NAME);
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

function getSessionPayload(request: Request): { userId: string; createdAt: number } | null {
  const value = getSessionToken(request);
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; createdAt?: number };
    if (!decoded.userId) return null;
    const createdAt = Number(decoded.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    return { userId: decoded.userId, createdAt };
  } catch {
    return null;
  }
}

export function getSessionUserId(request: Request): string | null {
  return getSessionPayload(request)?.userId ?? null;
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
  const session = getSessionPayload(request);
  if (!session) return null;

  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  const user = await repository.getUserById(session.userId);
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
