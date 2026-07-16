import crypto from "node:crypto";
import { AccountLifecycleError } from "@/lib/repositories/account-lifecycle-async-repository";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { FirebaseManagedActionEmail } from "@/lib/firebase-managed-action-email";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";

type RecoveryTargetRow = {
  id: string;
  email: string | null;
  account_status: string;
  system_role_enabled: number | boolean;
};

const SELECT_RECOVERY_TARGET_BY_USER_SQL = `
  SELECT id, email, account_status, system_role_enabled
  FROM users
  WHERE id = :userId
  LIMIT 1
`;

const SELECT_RECOVERY_TARGET_BY_EMAIL_SQL = `
  SELECT id, email, account_status, system_role_enabled
  FROM users
  WHERE lower(email) = :email
  LIMIT 1
`;

type HandoffWindow = { count: number; resetAt: number; blockedUntil: number };
const handoffWindows = new Map<string, HandoffWindow>();

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return "";
  return email;
}

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
}

function publicBaseUrl(request: Request) {
  const configured = process.env.PDM_PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall back to the current request origin for local development.
    }
  }
  return new URL(request.url).origin;
}

function recoveryContinueUrl(request: Request) {
  return new URL("/login", publicBaseUrl(request)).toString();
}

function isActiveTarget(row: RecoveryTargetRow | null) {
  return Boolean(row?.email) && row?.account_status === "active" && row.system_role_enabled !== 0 && row.system_role_enabled !== false;
}

function rateLimitAllows(request: Request, email: string) {
  const now = Date.now();
  const key = sha256(`${email}|${requestIp(request)}`);
  const current = handoffWindows.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) return false;
  if (!current || current.resetAt <= now) {
    handoffWindows.set(key, { count: 1, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 });
    return true;
  }
  current.count += 1;
  if (current.count > 5) {
    current.blockedUntil = now + 15 * 60 * 1000;
    return false;
  }
  return true;
}

async function sendProviderEmail(input: { request: Request; email: string; actionEmail?: FirebaseManagedActionEmail }) {
  await (input.actionEmail ?? new FirebaseManagedActionEmail()).sendPasswordResetEmail({
    email: input.email,
    continueUrl: recoveryContinueUrl(input.request)
  });
}

export async function sendProviderRecoveryHandoffForUserAsync(input: {
  request: Request;
  actorId: string;
  userId: string;
  actionEmail?: FirebaseManagedActionEmail;
  client?: AsyncDatabaseClient;
}) {
  const client = input.client ?? getAsyncDatabaseClient();
  const target = await client.queryOne<RecoveryTargetRow>(SELECT_RECOVERY_TARGET_BY_USER_SQL, { userId: input.userId });
  if (!target) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
  if (!isActiveTarget(target) || !target.email) {
    throw new AccountLifecycleError("provider_recovery_target_inactive", "此帳號目前不能寄送供應商復原郵件。", 409);
  }
  await sendProviderEmail({ request: input.request, email: target.email, actionEmail: input.actionEmail });
  await new AsyncAuditRepository(client).createAuditLog({
    actorId: input.actorId,
    action: "AccountProviderRecoveryHandoffCreated",
    detail: { userId: target.id, provider: "firebase_managed_action_email" }
  });
  return {
    delivery: "provider_managed_email" as const,
    provider: "firebase",
    email: target.email
  };
}

export async function requestProviderRecoveryHandoffByEmailAsync(input: {
  request: Request;
  email: string;
  actionEmail?: FirebaseManagedActionEmail;
  client?: AsyncDatabaseClient;
}) {
  const email = normalizeEmail(input.email);
  if (!email) return { accepted: true as const };
  if (!rateLimitAllows(input.request, email)) return { accepted: true as const };

  const client = input.client ?? getAsyncDatabaseClient();
  const target = await client.queryOne<RecoveryTargetRow>(SELECT_RECOVERY_TARGET_BY_EMAIL_SQL, { email });
  if (!isActiveTarget(target) || !target?.email) return { accepted: true as const };

  try {
    await sendProviderEmail({ request: input.request, email: target.email, actionEmail: input.actionEmail });
    await new AsyncAuditRepository(client).createAuditLog({
      actorId: target.id,
      action: "AccountProviderRecoveryHandoffRequested",
      detail: { provider: "firebase_managed_action_email", selfService: true }
    });
  } catch {
    return { accepted: true as const };
  }

  return { accepted: true as const };
}
