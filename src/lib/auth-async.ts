import crypto from "node:crypto";
import { forbidden, unauthorized } from "@/lib/auth";
import { getAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUser } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { DbUserWithPassword } from "@/lib/repositories/user-repository";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

const cookieName = "pdm_session";
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
  const cookieToken = parseCookies(request.headers.get("cookie")).get(cookieName);
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

export function getSessionUserId(request: Request): string | null {
  const value = getSessionToken(request);
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string };
    return decoded.userId || null;
  } catch {
    return null;
  }
}

export async function getSessionUserAsync(request: Request): Promise<DbUser | null> {
  const userId = getSessionUserId(request);
  if (!userId) return null;

  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  return repository.getUserById(userId);
}

export async function getUserByEmailWithPasswordAsync(email: string): Promise<DbUserWithPassword | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  return repository.getUserByEmailWithPassword(email);
}

export async function getUserByIdAsync(userId: string): Promise<DbUser | null> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncUserRepository(client);
  return repository.getUserById(userId);
}

export async function createUserAsync(input: {
  displayName: string;
  email: string;
  passwordHash: string;
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
