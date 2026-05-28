import crypto from "node:crypto";
import { getUserById, type DbUser } from "@/lib/db";

const cookieName = "pdm_session";

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

export function generateToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, createdAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function createSessionCookie(userId: string) {
  const value = generateToken(userId);
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`;
}

export function createLogoutCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionUser(request: Request): DbUser | null {
  let value = parseCookies(request.headers.get("cookie")).get(cookieName);

  if (!value) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      value = authHeader.substring(7).trim();
    }
  }

  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string };
    if (!decoded.userId) return null;
    return getUserById(decoded.userId) ?? null;
  } catch {
    return null;
  }
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
