import crypto from "node:crypto";
import { getDb, getUserById, type DbUser } from "@/lib/db";

export const SESSION_COOKIE_NAME = "pdm_session";
export const FIREBASE_HOSTING_SESSION_COOKIE_NAME = "__session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
export const FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

export type LegacySessionPayload = {
  userId: string;
  createdAt: number;
  sessionId: string | null;
};

export type IssuedLegacySession = {
  token: string;
  cookie: string;
  sessionId: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

function getAuthSecret() {
  return process.env.PDM_AUTH_SECRET || "dev-only-change-before-production";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

export function isSecureCookieEnabled() {
  const configured = String(process.env.PDM_COOKIE_SECURE ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(configured) || String(process.env.PDM_PUBLIC_BASE_URL ?? "").startsWith("https://");
}

function secureCookieDirective() {
  return isSecureCookieEnabled() ? "; Secure" : "";
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

export function getSessionCookieToken(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  return cookies.get(FIREBASE_HOSTING_SESSION_COOKIE_NAME) ?? cookies.get(SESSION_COOKIE_NAME) ?? null;
}

export function getSessionToken(request: Request) {
  const cookieToken = getSessionCookieToken(request);
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }

  return null;
}

export function decodeLegacySessionToken(value: string | null): LegacySessionPayload | null {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      createdAt?: number;
      sessionId?: string;
    };
    if (!decoded.userId) return null;
    const createdAt = Number(decoded.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    const sessionId = typeof decoded.sessionId === "string" && decoded.sessionId.trim() ? decoded.sessionId.trim() : null;
    return { userId: decoded.userId, createdAt, sessionId };
  } catch {
    return null;
  }
}

export function getLegacySessionPayload(request: Request): LegacySessionPayload | null {
  return decodeLegacySessionToken(getSessionToken(request));
}

export function generateToken(userId: string, input: { createdAt?: number; sessionId?: string } = {}): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      createdAt: input.createdAt ?? Date.now(),
      sessionId: input.sessionId ?? crypto.randomUUID()
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function issueSessionCookie(userId: string, input: { createdAt?: number; sessionId?: string } = {}): IssuedLegacySession {
  const issuedAtMs = input.createdAt ?? Date.now();
  const sessionId = input.sessionId ?? crypto.randomUUID();
  const token = generateToken(userId, { createdAt: issuedAtMs, sessionId });
  return {
    token,
    cookie: `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}${secureCookieDirective()}`,
    sessionId,
    issuedAtMs,
    expiresAtMs: issuedAtMs + SESSION_COOKIE_MAX_AGE_SECONDS * 1000
  };
}

export function createSessionCookie(userId: string) {
  return issueSessionCookie(userId).cookie;
}

export function createFirebaseBffSessionCookie(token: string) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(token)) throw new Error("SESSION_V2_COOKIE_TOKEN_INVALID");
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS}${secureCookieDirective()}`;
}

export function createFirebaseHostingBffSessionCookie(token: string) {
  if (!/^[A-Za-z0-9_.-]+$/u.test(token)) throw new Error("SESSION_V2_COOKIE_TOKEN_INVALID");
  return `${FIREBASE_HOSTING_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FIREBASE_BFF_SESSION_COOKIE_MAX_AGE_SECONDS}${secureCookieDirective()}`;
}

export function createLogoutCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieDirective()}`;
}

export function createFirebaseHostingLogoutCookie() {
  return `${FIREBASE_HOSTING_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieDirective()}`;
}

function isSessionUserAllowed(user: DbUser | undefined | null, tokenCreatedAt: number) {
  if (!user || user.account_status !== "active") return false;
  if (user.system_role_enabled === 0 || user.system_role_enabled === false) return false;
  if (!Number.isFinite(tokenCreatedAt) || tokenCreatedAt <= 0) return false;
  if (tokenCreatedAt > Date.now() + 5 * 60 * 1000) return false;
  const invalidBefore = user.session_invalid_before ? Date.parse(user.session_invalid_before) : Number.NaN;
  if (Number.isFinite(invalidBefore) && tokenCreatedAt <= invalidBefore) return false;
  return true;
}

function isLegacySessionRevoked(userId: string, sessionId: string | null) {
  if (!sessionId) return false;
  const sessionIdHash = crypto.createHash("sha256").update(`pdm-session-v2:${sessionId}`).digest("hex");
  try {
    const row = getDb()
      .prepare("SELECT revoked_at, expires_at FROM account_session_records WHERE user_id = ? AND session_id_hash = ? LIMIT 1")
      .get(userId, sessionIdHash) as { revoked_at: string | null; expires_at: string | null } | undefined;
    if (!row) return false;
    if (row.revoked_at) return true;
    const expiresAt = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  } catch {
    return false;
  }
}

export function getSessionUser(request: Request): DbUser | null {
  const decoded = getLegacySessionPayload(request);
  if (!decoded) return null;
  if (isLegacySessionRevoked(decoded.userId, decoded.sessionId)) return null;
  const user = getUserById(decoded.userId);
  return isSessionUserAllowed(user, decoded.createdAt) ? user ?? null : null;
}

export function unauthorized() {
  return Response.json({ error: "需要登入" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Insufficient role permission" }, { status: 403 });
}

export function requireAuth(request: Request) {
  const user = getSessionUser(request);
  if (!user) return { user: null, response: unauthorized() };
  return { user, response: null };
}

export function requireRole(request: Request, roles: DbUser["role"][]) {
  const auth = requireAuth(request);
  if (!auth.user) return auth;
  if (!roles.includes(auth.user.role)) return { user: auth.user, response: forbidden() };
  return { user: auth.user, response: null };
}
