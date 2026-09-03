import crypto from "node:crypto";
import { getLegacySessionPayload, issueSessionCookie, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth";
import type { DbUser } from "@/lib/db";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { JenfuPlatformSessionV1Claims } from "@/lib/jenfu-platform-session-v1";
import type { PlatformAssuranceLevel, PlatformSessionV2Claims } from "@/lib/platform-session-v2";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";

export type AccountSessionAuthProvider = "legacy_managed" | "firebase_bff";
export type AccountSessionDeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export type AccountSessionSummary = {
  id: string;
  authProvider: AccountSessionAuthProvider;
  assuranceLevel: PlatformAssuranceLevel;
  deviceType: AccountSessionDeviceType;
  deviceLabel: string;
  userAgentHint: string;
  ipSummary: string | null;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  current: boolean;
};

type AccountSessionRow = {
  id: string;
  user_id: string;
  company_id: string;
  session_id_hash: string;
  auth_provider: AccountSessionAuthProvider;
  assurance_level: PlatformAssuranceLevel;
  device_type: AccountSessionDeviceType;
  device_label: string;
  user_agent_hint: string;
  ip_summary: string | null;
  issued_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
};

const INSERT_SESSION_SQL = `
  INSERT INTO account_session_records (
    id, user_id, company_id, session_id_hash, auth_provider, assurance_level,
    device_type, device_label, user_agent_hash, user_agent_hint, ip_hash, ip_summary,
    issued_at, last_seen_at, expires_at, created_at, updated_at
  )
  VALUES (
    :id, :userId, :companyId, :sessionIdHash, :authProvider, :assuranceLevel,
    :deviceType, :deviceLabel, :userAgentHash, :userAgentHint, :ipHash, :ipSummary,
    :issuedAt, :lastSeenAt, :expiresAt, :now, :now
  )
  ON CONFLICT(session_id_hash) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at,
    device_type = excluded.device_type,
    device_label = excluded.device_label,
    user_agent_hash = excluded.user_agent_hash,
    user_agent_hint = excluded.user_agent_hint,
    ip_hash = excluded.ip_hash,
    ip_summary = excluded.ip_summary,
    updated_at = excluded.updated_at
`;

const TOUCH_SESSION_SQL = `
  UPDATE account_session_records
  SET last_seen_at = :now,
      updated_at = :now
  WHERE user_id = :userId
    AND session_id_hash = :sessionIdHash
    AND revoked_at IS NULL
`;

const SELECT_REVOKED_SESSION_SQL = `
  SELECT revoked_at, expires_at
  FROM account_session_records
  WHERE user_id = :userId
    AND session_id_hash = :sessionIdHash
  LIMIT 1
`;

const SELECT_USER_SESSIONS_SQL = `
  SELECT id, user_id, company_id, session_id_hash, auth_provider, assurance_level,
         device_type, device_label, user_agent_hint, ip_summary,
         issued_at, last_seen_at, expires_at, revoked_at, revoked_by, revoke_reason
  FROM account_session_records
  WHERE user_id = :userId
  ORDER BY
    CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,
    last_seen_at DESC,
    issued_at DESC
  LIMIT :limit
`;

const SELECT_USER_SESSION_BY_ID_SQL = `
  SELECT id, user_id, company_id, session_id_hash, auth_provider, assurance_level,
         device_type, device_label, user_agent_hint, ip_summary,
         issued_at, last_seen_at, expires_at, revoked_at, revoked_by, revoke_reason
  FROM account_session_records
  WHERE id = :recordId
    AND user_id = :userId
  LIMIT 1
`;

const REVOKE_SESSION_BY_ID_SQL = `
  UPDATE account_session_records
  SET revoked_at = :now,
      revoked_by = :actorId,
      revoke_reason = :reason,
      updated_at = :now
  WHERE id = :recordId
    AND user_id = :userId
    AND revoked_at IS NULL
`;

const REVOKE_SESSION_BY_HASH_SQL = `
  UPDATE account_session_records
  SET revoked_at = :now,
      revoked_by = :actorId,
      revoke_reason = :reason,
      updated_at = :now
  WHERE user_id = :userId
    AND session_id_hash = :sessionIdHash
    AND revoked_at IS NULL
`;

export class AccountSessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = "AccountSessionError";
  }
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashAccountSessionId(sessionId: string) {
  const normalized = sessionId.trim();
  if (!normalized) throw new AccountSessionError("session_id_required", "工作階段資料不完整。", 400);
  return sha256(`pdm-session-v2:${normalized}`);
}

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || "";
}

function summarizeIp(ip: string) {
  if (!ip) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(ip)) {
    const [a, b] = ip.split(".");
    return `${a}.${b}.x.x`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return `${parts.slice(0, 2).join(":") || "ipv6"}::/32`;
  }
  return "unknown";
}

function userAgent(request: Request) {
  return request.headers.get("user-agent")?.trim() ?? "";
}

function deviceTypeFromUserAgent(value: string): AccountSessionDeviceType {
  const ua = value.toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet/u.test(ua)) return "tablet";
  if (/mobi|iphone|android/u.test(ua)) return "mobile";
  return "desktop";
}

function browserHint(value: string) {
  const ua = value.toLowerCase();
  if (!ua) return "未知瀏覽器";
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/")
          ? "Safari"
          : "瀏覽器";
  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("mac os")
      ? "macOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("iphone") || ua.includes("ipad")
          ? "iOS"
          : "裝置";
  return `${browser} / ${os}`;
}

function toIso(value: number | string | Date) {
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeIso(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function mapRow(row: AccountSessionRow, currentSessionHash: string | null): AccountSessionSummary {
  return {
    id: row.id,
    authProvider: row.auth_provider,
    assuranceLevel: row.assurance_level,
    deviceType: row.device_type,
    deviceLabel: row.device_label,
    userAgentHint: row.user_agent_hint,
    ipSummary: row.ip_summary,
    issuedAt: normalizeIso(row.issued_at) ?? row.issued_at,
    lastSeenAt: normalizeIso(row.last_seen_at) ?? row.last_seen_at,
    expiresAt: normalizeIso(row.expires_at) ?? row.expires_at,
    revokedAt: normalizeIso(row.revoked_at),
    revokedBy: row.revoked_by,
    revokeReason: row.revoke_reason,
    current: Boolean(currentSessionHash && row.session_id_hash === currentSessionHash)
  };
}

export async function registerAccountSessionAsync(input: {
  request: Request;
  userId: string;
  companyId: string;
  sessionId: string;
  authProvider: AccountSessionAuthProvider;
  assuranceLevel: PlatformAssuranceLevel;
  issuedAt: string | number | Date;
  expiresAt: string | number | Date;
  client?: AsyncDatabaseClient;
}) {
  const client = input.client ?? getAsyncDatabaseClient();
  const now = new Date().toISOString();
  const ua = userAgent(input.request);
  const ip = requestIp(input.request);
  const deviceType = deviceTypeFromUserAgent(ua);
  await client.execute(INSERT_SESSION_SQL, {
    id: `session-${crypto.randomUUID()}`,
    userId: input.userId,
    companyId: input.companyId,
    sessionIdHash: hashAccountSessionId(input.sessionId),
    authProvider: input.authProvider,
    assuranceLevel: input.assuranceLevel,
    deviceType,
    deviceLabel: deviceType === "unknown" ? "未知裝置" : deviceType === "desktop" ? "桌面裝置" : deviceType === "tablet" ? "平板裝置" : "行動裝置",
    userAgentHash: ua ? sha256(ua) : null,
    userAgentHint: browserHint(ua).slice(0, 160),
    ipHash: ip ? sha256(`pdm-session-ip:${ip}`) : null,
    ipSummary: summarizeIp(ip),
    issuedAt: toIso(input.issuedAt),
    lastSeenAt: now,
    expiresAt: toIso(input.expiresAt),
    now
  });
}

export async function issueRegisteredLegacySessionCookieAsync(input: {
  request: Request;
  user: Pick<DbUser, "id" | "company_id">;
  sessionId?: string | null;
}) {
  const issued = issueSessionCookie(input.user.id, { sessionId: input.sessionId || undefined });
  await registerAccountSessionAsync({
    request: input.request,
    userId: input.user.id,
    companyId: input.user.company_id,
    sessionId: issued.sessionId,
    authProvider: "legacy_managed",
    assuranceLevel: "aal1",
    issuedAt: issued.issuedAtMs,
    expiresAt: issued.expiresAtMs
  });
  return issued.cookie;
}

export async function refreshRegisteredLegacySessionCookieAsync(input: {
  request: Request;
  user: Pick<DbUser, "id" | "company_id">;
}) {
  const existing = getLegacySessionPayload(input.request);
  return issueRegisteredLegacySessionCookieAsync({ request: input.request, user: input.user, sessionId: existing?.sessionId ?? null });
}

export async function registerFirebaseAccountSessionAsync(input: {
  request: Request;
  claims: PlatformSessionV2Claims;
}) {
  await registerAccountSessionAsync({
    request: input.request,
    userId: input.claims.pdmUserId,
    companyId: input.claims.companyId,
    sessionId: input.claims.sessionId,
    authProvider: "firebase_bff",
    assuranceLevel: input.claims.assuranceLevel,
    issuedAt: input.claims.issuedAt * 1000,
    expiresAt: input.claims.expiresAt * 1000
  });
}

export async function registerJenfuAccountSessionAsync(input: {
  request: Request;
  claims: JenfuPlatformSessionV1Claims;
}) {
  await registerAccountSessionAsync({
    request: input.request,
    userId: input.claims.localPrincipalId,
    companyId: input.claims.companyId,
    sessionId: input.claims.sessionId,
    authProvider: "firebase_bff",
    assuranceLevel: input.claims.assuranceLevel,
    issuedAt: input.claims.issuedAt * 1000,
    expiresAt: input.claims.expiresAt * 1000
  });
}

export async function isAccountSessionRevokedAsync(input: { userId: string; sessionId: string }) {
  const row = await getAsyncDatabaseClient().queryOne<{ revoked_at: string | null; expires_at: string | null }>(SELECT_REVOKED_SESSION_SQL, {
    userId: input.userId,
    sessionIdHash: hashAccountSessionId(input.sessionId)
  });
  if (!row) return false;
  if (row.revoked_at) return true;
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export async function isAccountSessionActiveAsync(input: {
  userId: string;
  sessionId: string;
  nowMs?: number;
  client?: AsyncDatabaseClient;
}) {
  const row = await (input.client ?? getAsyncDatabaseClient()).queryOne<{
    revoked_at: string | null;
    expires_at: string | null;
  }>(SELECT_REVOKED_SESSION_SQL, {
    userId: input.userId,
    sessionIdHash: hashAccountSessionId(input.sessionId)
  });
  if (!row || row.revoked_at) return false;
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt > (input.nowMs ?? Date.now());
}

export async function touchAccountSessionAsync(input: { userId: string; sessionId: string }) {
  await getAsyncDatabaseClient().execute(TOUCH_SESSION_SQL, {
    userId: input.userId,
    sessionIdHash: hashAccountSessionId(input.sessionId),
    now: new Date().toISOString()
  });
}

export async function listAccountSessionsAsync(input: { userId: string; currentSessionId?: string | null; limit?: number }) {
  const currentSessionHash = input.currentSessionId ? hashAccountSessionId(input.currentSessionId) : null;
  const rows = await getAsyncDatabaseClient().query<AccountSessionRow>(SELECT_USER_SESSIONS_SQL, {
    userId: input.userId,
    limit: Math.max(1, Math.min(50, Math.trunc(input.limit ?? 20)))
  });
  return rows.map((row) => mapRow(row, currentSessionHash));
}

export async function revokeAccountSessionRecordAsync(input: {
  actorId: string;
  userId: string;
  recordId: string;
  currentSessionId?: string | null;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new AccountSessionError("session_revoke_reason_required", "請填寫撤銷原因。", 400);
  const row = await getAsyncDatabaseClient().queryOne<AccountSessionRow>(SELECT_USER_SESSION_BY_ID_SQL, {
    userId: input.userId,
    recordId: input.recordId
  });
  if (!row) throw new AccountSessionError("session_not_found", "找不到指定工作階段。", 404);
  if (input.currentSessionId && row.session_id_hash === hashAccountSessionId(input.currentSessionId)) {
    throw new AccountSessionError("current_session_revoke_blocked", "目前工作階段請使用登出，不可在此撤銷。", 409);
  }
  const now = new Date().toISOString();
  await getAsyncDatabaseClient().transaction(async (client) => {
    await client.execute(REVOKE_SESSION_BY_ID_SQL, {
      recordId: row.id,
      userId: input.userId,
      now,
      actorId: input.actorId,
      reason
    });
    await new AsyncAuditRepository(client).createAuditLog({
      actorId: input.actorId,
      action: "AccountSessionRevoked",
      detail: { userId: input.userId, sessionRecordId: row.id, reason, selfService: input.actorId === input.userId }
    });
  });
}

export async function revokeAccountSessionBySessionIdAsync(input: {
  actorId: string;
  userId: string;
  sessionId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) return;
  await getAsyncDatabaseClient().execute(REVOKE_SESSION_BY_HASH_SQL, {
    userId: input.userId,
    sessionIdHash: hashAccountSessionId(input.sessionId),
    now: new Date().toISOString(),
    actorId: input.actorId,
    reason
  });
}

export function legacySessionExpiresAtFromNow() {
  return new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();
}
