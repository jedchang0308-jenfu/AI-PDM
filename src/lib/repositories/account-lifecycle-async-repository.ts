import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import type { AuthIdentityProvider, AuthIdentityStatus } from "@/lib/repositories/auth-identity-async-repository";
import type { DbUser, DbUserWithPassword, UserAccountStatus } from "@/lib/repositories/user-repository";

export type AccountLifecycleAction = "suspend" | "reactivate" | "offboard" | "return_to_work";
export type AccountRecoveryRequestStatus = "pending" | "used" | "revoked" | "expired";

export type AdminAccountSummary = {
  id: string;
  displayName: string;
  email: string | null;
  role: DbUser["role"];
  companyId: string;
  companyName: string | null;
  accountStatus: UserAccountStatus;
  systemRoleEnabled: boolean;
  sessionInvalidBefore: string | null;
  lifecycleVersion: number;
  changedAt: string | null;
  changedBy: string | null;
  changedReason: string | null;
  activeIdentityCount: number;
  identityProviders: AuthIdentityProvider[];
  lastLoginAt: string | null;
};

export type AdminAccountIdentity = {
  id: string;
  provider: AuthIdentityProvider;
  loginIdentifier: string | null;
  emailNormalized: string | null;
  status: AuthIdentityStatus;
  verifiedAt: string | null;
  lastLoginAt: string | null;
  lifecycleVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminAccountDetail = AdminAccountSummary & {
  identities: AdminAccountIdentity[];
  activeRoleAssignments: Array<{
    id: string;
    roleCode: string;
    roleTitle: string;
    startsAt: string | null;
    reviewDueAt: string | null;
    hardEndsAt: string | null;
    reason: string;
  }>;
};

export type AccountRecoveryRequest = {
  id: string;
  userId: string;
  identityId: string | null;
  requestType: "admin_password_reset" | "account_recovery";
  status: AccountRecoveryRequestStatus;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type AccountRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: DbUser["role"];
  company_id: string;
  company_name: string | null;
  account_status: UserAccountStatus;
  system_role_enabled: number | boolean;
  session_invalid_before: string | null;
  account_lifecycle_version: number;
  account_status_changed_at: string | null;
  account_status_changed_by: string | null;
  account_status_reason: string | null;
  active_identity_count: number | string | null;
  identity_providers: string | null;
  last_login_at: string | null;
};

type IdentityRow = {
  id: string;
  provider: AuthIdentityProvider;
  login_identifier: string | null;
  email_normalized: string | null;
  status: AuthIdentityStatus;
  verified_at: string | null;
  last_login_at: string | null;
  identity_lifecycle_version: number;
  created_at: string;
  updated_at: string;
};

type RecoveryRequestRow = {
  id: string;
  user_id: string;
  identity_id: string | null;
  request_type: "admin_password_reset" | "account_recovery";
  status: AccountRecoveryRequestStatus;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

const ACCOUNT_SELECT = `
  SELECT
    u.id,
    u.display_name,
    u.email,
    u.role,
    u.company_id,
    c.display_name AS company_name,
    u.account_status,
    u.system_role_enabled,
    u.session_invalid_before,
    u.account_lifecycle_version,
    u.account_status_changed_at,
    u.account_status_changed_by,
    u.account_status_reason,
    COALESCE((SELECT COUNT(*) FROM auth_identities ai WHERE ai.user_id = u.id AND ai.status = 'active'), 0) AS active_identity_count,
    NULL AS identity_providers,
    (SELECT MAX(ai.last_login_at) FROM auth_identities ai WHERE ai.user_id = u.id) AS last_login_at
  FROM users u
  LEFT JOIN companies c ON c.id = u.company_id
`;

const ACCOUNT_GROUP_ORDER = `
  ORDER BY u.updated_at DESC, u.display_name ASC
`;

const LIST_ACCOUNTS_BASE_SQL = `
  ${ACCOUNT_SELECT}
  __WHERE__
  ${ACCOUNT_GROUP_ORDER}
  LIMIT :limit
`;

const SELECT_ACCOUNT_BY_ID_SQL = `
  ${ACCOUNT_SELECT}
  WHERE u.id = :userId
  ${ACCOUNT_GROUP_ORDER}
`;

const SELECT_ACCOUNT_IDENTITIES_SQL = `
  SELECT
    id, provider, login_identifier, email_normalized, status, verified_at,
    last_login_at, identity_lifecycle_version, created_at, updated_at
  FROM auth_identities
  WHERE user_id = :userId
  ORDER BY provider ASC, created_at ASC
`;

const SELECT_ACTIVE_ROLE_ASSIGNMENTS_SQL = `
  SELECT a.id, r.role_code, r.title AS role_title, a.starts_at, a.review_due_at, a.hard_ends_at, a.reason
  FROM user_role_assignments a
  JOIN roles r ON r.id = a.role_id
  WHERE a.user_id = :userId
    AND a.revoked_at IS NULL
  ORDER BY a.assigned_at DESC
`;

const SELECT_USER_FOR_UPDATE_SQL = `
  SELECT id, display_name, email, role, company_id, account_status,
         session_invalid_before, account_lifecycle_version, system_role_enabled,
         account_status_changed_at, account_status_changed_by, account_status_reason
  FROM users
  WHERE id = :userId
`;

const COUNT_ACTIVE_ADMINS_EXCLUDING_SQL = `
  SELECT COUNT(*) AS count
  FROM users
  WHERE role = 'Admin'
    AND account_status = 'active'
    AND system_role_enabled = 1
    AND id <> :userId
    AND EXISTS (
      SELECT 1
      FROM auth_identities i
      WHERE i.user_id = users.id
        AND i.status = 'active'
    )
`;

const UPDATE_ACCOUNT_LIFECYCLE_SQL = `
  UPDATE users
  SET account_status = :accountStatus,
      system_role_enabled = :systemRoleEnabled,
      session_invalid_before = :sessionInvalidBefore,
      account_lifecycle_version = account_lifecycle_version + 1,
      account_status_changed_at = :changedAt,
      account_status_changed_by = :changedBy,
      account_status_reason = :reason,
      updated_at = :changedAt
  WHERE id = :userId
`;

const UPDATE_SESSION_INVALID_SQL = `
  UPDATE users
  SET session_invalid_before = :invalidBefore,
      account_lifecycle_version = account_lifecycle_version + 1,
      updated_at = :invalidBefore
  WHERE id = :userId
`;

const REVOKE_USER_ROLE_ASSIGNMENTS_SQL = `
  UPDATE user_role_assignments
  SET revoked_at = :revokedAt,
      revoked_by = :revokedBy
  WHERE user_id = :userId
    AND revoked_at IS NULL
`;

const REVOKE_USER_DELEGATIONS_SQL = `
  UPDATE approval_delegations
  SET revoked_at = :revokedAt,
      revoked_by = :revokedBy
  WHERE (delegated_from = :userId OR delegated_to = :userId)
    AND revoked_at IS NULL
`;

const DISABLE_USER_IDENTITIES_SQL = `
  UPDATE auth_identities
  SET status = 'disabled',
      identity_lifecycle_version = identity_lifecycle_version + 1,
      updated_at = :updatedAt
  WHERE user_id = :userId
    AND status <> 'disabled'
`;

const SELECT_IDENTITY_BY_ID_SQL = `
  SELECT id, user_id, provider, status, last_login_at
  FROM auth_identities
  WHERE id = :identityId
`;

const COUNT_ACTIVE_IDENTITIES_EXCLUDING_SQL = `
  SELECT COUNT(*) AS count
  FROM auth_identities
  WHERE user_id = :userId
    AND status = 'active'
    AND id <> :identityId
`;

const UPDATE_IDENTITY_STATUS_SQL = `
  UPDATE auth_identities
  SET status = :status,
      identity_lifecycle_version = identity_lifecycle_version + 1,
      updated_at = :updatedAt
  WHERE id = :identityId
`;

const EXPIRE_RECOVERY_REQUESTS_SQL = `
  UPDATE account_recovery_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= :now
`;

const REVOKE_PENDING_RECOVERY_REQUESTS_SQL = `
  UPDATE account_recovery_requests
  SET status = 'revoked',
      revoked_at = :revokedAt,
      revoked_by = :revokedBy
  WHERE user_id = :userId
    AND request_type = :requestType
    AND status = 'pending'
`;

const INSERT_RECOVERY_REQUEST_SQL = `
  INSERT INTO account_recovery_requests (
    id, user_id, identity_id, request_type, token_hash, status,
    created_by, created_at, expires_at
  )
  VALUES (
    :id, :userId, :identityId, :requestType, :tokenHash, 'pending',
    :createdBy, :createdAt, :expiresAt
  )
`;

const SELECT_RECOVERY_REQUEST_BY_TOKEN_SQL = `
  SELECT id, user_id, identity_id, request_type, status, created_by, created_at, expires_at, used_at
  FROM account_recovery_requests
  WHERE token_hash = :tokenHash
  LIMIT 1
`;

const USE_RECOVERY_REQUEST_SQL = `
  UPDATE account_recovery_requests
  SET status = 'used',
      used_at = :usedAt,
      used_by = :usedBy
  WHERE id = :id
    AND status = 'pending'
    AND expires_at > :usedAt
`;

const UPDATE_USER_PASSWORD_SQL = `
  UPDATE users
  SET password_hash = :passwordHash,
      session_invalid_before = :updatedAt,
      account_lifecycle_version = account_lifecycle_version + 1,
      updated_at = :updatedAt
  WHERE id = :userId
`;

const UPSERT_LOCAL_IDENTITY_PRESERVE_STATUS_SQL = `
  INSERT INTO auth_identities (
    id, user_id, provider, provider_subject, login_identifier, email_normalized,
    verified_at, last_login_at, status, created_at, updated_at
  )
  VALUES (
    :id, :userId, 'local_password', :email, :email, :email,
    :now, NULL, 'active', :now, :now
  )
  ON CONFLICT(user_id, provider) DO UPDATE SET
    provider_subject = excluded.provider_subject,
    login_identifier = excluded.login_identifier,
    email_normalized = excluded.email_normalized,
    updated_at = excluded.updated_at
`;

function boolValue(value: number | boolean | null | undefined) {
  return value === true || Number(value) === 1;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseProviders(value: string | null): AuthIdentityProvider[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as AuthIdentityProvider[];
}

function normalizeTimestamp(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function mapAccount(row: AccountRow): AdminAccountSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    accountStatus: row.account_status,
    systemRoleEnabled: boolValue(row.system_role_enabled),
    sessionInvalidBefore: normalizeTimestamp(row.session_invalid_before),
    lifecycleVersion: toNumber(row.account_lifecycle_version),
    changedAt: normalizeTimestamp(row.account_status_changed_at),
    changedBy: row.account_status_changed_by,
    changedReason: row.account_status_reason,
    activeIdentityCount: toNumber(row.active_identity_count),
    identityProviders: parseProviders(row.identity_providers),
    lastLoginAt: normalizeTimestamp(row.last_login_at)
  };
}

function mapIdentity(row: IdentityRow): AdminAccountIdentity {
  return {
    id: row.id,
    provider: row.provider,
    loginIdentifier: row.login_identifier,
    emailNormalized: row.email_normalized,
    status: row.status,
    verifiedAt: normalizeTimestamp(row.verified_at),
    lastLoginAt: normalizeTimestamp(row.last_login_at),
    lifecycleVersion: toNumber(row.identity_lifecycle_version),
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    updatedAt: normalizeTimestamp(row.updated_at) ?? row.updated_at
  };
}

function mapRecoveryRequest(row: RecoveryRequestRow): AccountRecoveryRequest {
  return {
    id: row.id,
    userId: row.user_id,
    identityId: row.identity_id,
    requestType: row.request_type,
    status: row.status,
    createdBy: row.created_by,
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    expiresAt: normalizeTimestamp(row.expires_at) ?? row.expires_at,
    usedAt: normalizeTimestamp(row.used_at)
  };
}

function normalizePasswordResetToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < 20 || normalized.length > 200 || !/^[A-Za-z0-9_-]+$/u.test(normalized)) return "";
  return normalized;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isBlockingAdminAction(action: AccountLifecycleAction) {
  return action === "suspend" || action === "offboard";
}

export class AccountLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = "AccountLifecycleError";
  }
}

export class AsyncAccountLifecycleRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listAccounts(input: {
    query?: string;
    status?: string;
    provider?: string;
    role?: string;
    limit?: number;
  } = {}): Promise<AdminAccountSummary[]> {
    const where: string[] = [];
    const params: Record<string, unknown> = {
      limit: Math.max(1, Math.min(200, Math.trunc(input.limit ?? 100)))
    };
    if (input.query?.trim()) {
      where.push("(lower(u.display_name) LIKE :query OR lower(COALESCE(u.email, '')) LIKE :query)");
      params.query = `%${input.query.trim().toLowerCase()}%`;
    }
    if (input.status?.trim()) {
      where.push("u.account_status = :status");
      params.status = input.status.trim();
    }
    if (input.role?.trim()) {
      where.push("u.role = :role");
      params.role = input.role.trim();
    }
    if (input.provider?.trim()) {
      where.push("EXISTS (SELECT 1 FROM auth_identities p WHERE p.user_id = u.id AND p.provider = :provider)");
      params.provider = input.provider.trim();
    }

    const sql = LIST_ACCOUNTS_BASE_SQL.replace("__WHERE__", where.length ? `WHERE ${where.join(" AND ")}` : "");
    const rows = await this.client.query<AccountRow>(sql, params);
    return rows.map(mapAccount);
  }

  async getAccountDetail(userId: string): Promise<AdminAccountDetail | null> {
    const row = await this.client.queryOne<AccountRow>(SELECT_ACCOUNT_BY_ID_SQL, { userId });
    if (!row) return null;
    const [identities, roleAssignments] = await Promise.all([
      this.client.query<IdentityRow>(SELECT_ACCOUNT_IDENTITIES_SQL, { userId }),
      this.client.query<{
        id: string;
        role_code: string;
        role_title: string;
        starts_at: string | null;
        review_due_at: string | null;
        hard_ends_at: string | null;
        reason: string;
      }>(SELECT_ACTIVE_ROLE_ASSIGNMENTS_SQL, { userId })
    ]);
    return {
      ...mapAccount(row),
      identities: identities.map(mapIdentity),
      activeRoleAssignments: roleAssignments.map((assignment) => ({
        id: assignment.id,
        roleCode: assignment.role_code,
        roleTitle: assignment.role_title,
        startsAt: assignment.starts_at,
        reviewDueAt: assignment.review_due_at,
        hardEndsAt: assignment.hard_ends_at,
        reason: assignment.reason
      }))
    };
  }

  async updateLifecycle(input: {
    actorId: string;
    userId: string;
    action: AccountLifecycleAction;
    reason: string;
  }): Promise<AdminAccountDetail> {
    const reason = input.reason.trim();
    if (!reason) throw new AccountLifecycleError("account_lifecycle_reason_required", "請填寫異動原因。", 400);
    const now = this.clock();
    return this.client.transaction(async (client) => {
      const current = await client.queryOne<DbUser>(SELECT_USER_FOR_UPDATE_SQL, { userId: input.userId });
      if (!current) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
      if (current.id === input.actorId && isBlockingAdminAction(input.action)) {
        throw new AccountLifecycleError("self_lockout_blocked", "不能停用或離職自己的管理帳號。", 409);
      }
      if (current.role === "Admin" && isBlockingAdminAction(input.action)) {
        await this.assertAnotherActiveAdmin(client, current.id);
      }

      const next =
        input.action === "suspend"
          ? { status: "suspended" as UserAccountStatus, systemRoleEnabled: true, revokeSessions: true }
          : input.action === "reactivate"
            ? { status: "active" as UserAccountStatus, systemRoleEnabled: true, revokeSessions: false }
          : input.action === "offboard"
            ? { status: "offboarded" as UserAccountStatus, systemRoleEnabled: false, revokeSessions: true }
            : { status: "active" as UserAccountStatus, systemRoleEnabled: true, revokeSessions: true };

      await client.execute(UPDATE_ACCOUNT_LIFECYCLE_SQL, {
        userId: current.id,
        accountStatus: next.status,
        systemRoleEnabled: next.systemRoleEnabled ? 1 : 0,
        sessionInvalidBefore: next.revokeSessions ? now : current.session_invalid_before ?? null,
        changedAt: now,
        changedBy: input.actorId,
        reason
      });

      if (input.action === "offboard") {
        await client.execute(REVOKE_USER_ROLE_ASSIGNMENTS_SQL, { userId: current.id, revokedAt: now, revokedBy: input.actorId });
        await client.execute(REVOKE_USER_DELEGATIONS_SQL, { userId: current.id, revokedAt: now, revokedBy: input.actorId });
        await client.execute(DISABLE_USER_IDENTITIES_SQL, { userId: current.id, updatedAt: now });
      }

      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.actorId,
        action: "AccountLifecycleChanged",
        detail: { userId: current.id, action: input.action, accountStatus: next.status, systemRoleEnabled: next.systemRoleEnabled, reason }
      });
      return (await this.getAccountDetailWithin(client, current.id)) ?? this.throwReadback();
    });
  }

  async revokeSessions(input: { actorId: string; userId: string; reason?: string }): Promise<AdminAccountDetail> {
    const now = this.clock();
    return this.client.transaction(async (client) => {
      const current = await client.queryOne<DbUser>(SELECT_USER_FOR_UPDATE_SQL, { userId: input.userId });
      if (!current) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
      await client.execute(UPDATE_SESSION_INVALID_SQL, { userId: current.id, invalidBefore: now });
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.actorId,
        action: "AccountSessionsRevoked",
        detail: { userId: current.id, reason: input.reason?.trim() || null }
      });
      return (await this.getAccountDetailWithin(client, current.id)) ?? this.throwReadback();
    });
  }

  async updateIdentityStatus(input: {
    actorId: string;
    userId: string;
    identityId: string;
    status: AuthIdentityStatus;
    reason: string;
  }): Promise<AdminAccountDetail> {
    const reason = input.reason.trim();
    if (!reason) throw new AccountLifecycleError("identity_lifecycle_reason_required", "請填寫異動原因。", 400);
    const now = this.clock();
    return this.client.transaction(async (client) => {
      const user = await client.queryOne<DbUser>(SELECT_USER_FOR_UPDATE_SQL, { userId: input.userId });
      if (!user) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
      const identity = await client.queryOne<{ id: string; user_id: string; provider: AuthIdentityProvider; status: AuthIdentityStatus }>(SELECT_IDENTITY_BY_ID_SQL, {
        identityId: input.identityId
      });
      if (!identity || identity.user_id !== user.id) throw new AccountLifecycleError("identity_not_found", "找不到指定登入方式。", 404);

      if (input.status === "disabled") {
        if (user.id === input.actorId) {
          throw new AccountLifecycleError("self_identity_disable_blocked", "不能停用自己的登入方式，請改由另一位系統管理員處理。", 409);
        }
        const remaining = await client.queryOne<{ count: number | string }>(COUNT_ACTIVE_IDENTITIES_EXCLUDING_SQL, {
          userId: user.id,
          identityId: identity.id
        });
        if (user.account_status === "active" && toNumber(remaining?.count) <= 0) {
          throw new AccountLifecycleError("last_identity_blocked", "這是此帳號最後一個可登入方式，請先新增其他登入方式或停用整個帳號。", 409);
        }
        if (user.role === "Admin" && user.account_status === "active") {
          await this.assertAnotherActiveAdmin(client, user.id);
        }
      }

      await client.execute(UPDATE_IDENTITY_STATUS_SQL, { identityId: identity.id, status: input.status, updatedAt: now });
      if (input.status === "disabled") {
        await client.execute(UPDATE_SESSION_INVALID_SQL, { userId: user.id, invalidBefore: now });
      }
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.actorId,
        action: "AccountIdentityStatusChanged",
        detail: { userId: user.id, identityId: identity.id, provider: identity.provider, status: input.status, reason }
      });
      return (await this.getAccountDetailWithin(client, user.id)) ?? this.throwReadback();
    });
  }

  async createPasswordReset(input: {
    actorId: string;
    userId: string;
    expiresInMinutes?: number;
  }): Promise<{ request: AccountRecoveryRequest; token: string }> {
    const now = this.clock();
    const minutes = Math.max(5, Math.min(1440, Math.trunc(input.expiresInMinutes ?? 60)));
    const expiresAt = new Date(Date.parse(now) + minutes * 60 * 1000).toISOString();
    const token = crypto.randomBytes(32).toString("base64url");
    const requestId = `recovery-${this.idFactory()}`;
    return this.client.transaction(async (client) => {
      const user = await client.queryOne<DbUser>(SELECT_USER_FOR_UPDATE_SQL, { userId: input.userId });
      if (!user) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
      await client.execute(EXPIRE_RECOVERY_REQUESTS_SQL, { now });
      await client.execute(REVOKE_PENDING_RECOVERY_REQUESTS_SQL, {
        userId: user.id,
        requestType: "admin_password_reset",
        revokedAt: now,
        revokedBy: input.actorId
      });
      await client.execute(INSERT_RECOVERY_REQUEST_SQL, {
        id: requestId,
        userId: user.id,
        identityId: null,
        requestType: "admin_password_reset",
        tokenHash: hashToken(token),
        createdBy: input.actorId,
        createdAt: now,
        expiresAt
      });
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.actorId,
        action: "AccountPasswordResetCreated",
        detail: { userId: user.id, requestId, expiresAt }
      });
      const request = await client.queryOne<RecoveryRequestRow>("SELECT id, user_id, identity_id, request_type, status, created_by, created_at, expires_at, used_at FROM account_recovery_requests WHERE id = :requestId", {
        requestId
      });
      if (!request) throw new Error("ACCOUNT_RECOVERY_CREATE_READBACK_FAILED");
      return { request: mapRecoveryRequest(request), token };
    });
  }

  async lookupRecoveryRequest(token: string): Promise<{ request: AccountRecoveryRequest; user: Pick<DbUser, "id" | "display_name" | "email" | "account_status"> }> {
    const normalized = normalizePasswordResetToken(token);
    if (!normalized) throw new AccountLifecycleError("invalid_recovery_token", "連結不完整或已損毀。", 400);
    const now = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_RECOVERY_REQUESTS_SQL, { now });
      const request = await client.queryOne<RecoveryRequestRow>(SELECT_RECOVERY_REQUEST_BY_TOKEN_SQL, { tokenHash: hashToken(normalized) });
      if (!request || request.status !== "pending") {
        throw new AccountLifecycleError("invalid_recovery_token", "此連結已失效，請聯絡系統管理員重新產生。", 410);
      }
      const user = await client.queryOne<Pick<DbUser, "id" | "display_name" | "email" | "account_status">>(
        "SELECT id, display_name, email, account_status FROM users WHERE id = :userId",
        { userId: request.user_id }
      );
      if (!user) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);
      return { request: mapRecoveryRequest(request), user };
    });
  }

  async completeRecovery(input: { token: string; passwordHash: string }): Promise<{ request: AccountRecoveryRequest; userId: string }> {
    const normalized = normalizePasswordResetToken(input.token);
    if (!normalized) throw new AccountLifecycleError("invalid_recovery_token", "連結不完整或已損毀。", 400);
    const now = this.clock();
    return this.client.transaction(async (client) => {
      await client.execute(EXPIRE_RECOVERY_REQUESTS_SQL, { now });
      const request = await client.queryOne<RecoveryRequestRow>(SELECT_RECOVERY_REQUEST_BY_TOKEN_SQL, { tokenHash: hashToken(normalized) });
      if (!request || request.status !== "pending") {
        throw new AccountLifecycleError("invalid_recovery_token", "此連結已失效，請聯絡系統管理員重新產生。", 410);
      }
      const user = await client.queryOne<DbUserWithPassword>(
        "SELECT id, display_name, email, password_hash, role, company_id, account_status, session_invalid_before, account_lifecycle_version, system_role_enabled, account_status_changed_at, account_status_changed_by, account_status_reason FROM users WHERE id = :userId",
        { userId: request.user_id }
      );
      if (!user?.email) throw new AccountLifecycleError("account_not_found", "找不到指定帳號。", 404);

      await client.execute(USE_RECOVERY_REQUEST_SQL, { id: request.id, usedAt: now, usedBy: user.id });
      await client.execute(UPDATE_USER_PASSWORD_SQL, { userId: user.id, passwordHash: input.passwordHash, updatedAt: now });
      await client.execute(UPSERT_LOCAL_IDENTITY_PRESERVE_STATUS_SQL, {
        id: `identity-local-${user.id}`,
        userId: user.id,
        email: user.email.trim().toLowerCase(),
        now
      });
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: user.id,
        action: "AccountPasswordResetCompleted",
        detail: { userId: user.id, requestId: request.id }
      });
      const used = await client.queryOne<RecoveryRequestRow>(
        "SELECT id, user_id, identity_id, request_type, status, created_by, created_at, expires_at, used_at FROM account_recovery_requests WHERE id = :requestId",
        { requestId: request.id }
      );
      if (!used) throw new Error("ACCOUNT_RECOVERY_COMPLETE_READBACK_FAILED");
      return { request: mapRecoveryRequest(used), userId: user.id };
    });
  }

  private async assertAnotherActiveAdmin(client: AsyncDatabaseClient, userId: string) {
    const row = await client.queryOne<{ count: number | string }>(COUNT_ACTIVE_ADMINS_EXCLUDING_SQL, { userId });
    if (toNumber(row?.count) <= 0) {
      throw new AccountLifecycleError("last_admin_blocked", "至少要保留另一個可登入的系統管理員。", 409);
    }
  }

  private async getAccountDetailWithin(client: AsyncDatabaseClient, userId: string) {
    const nested = new AsyncAccountLifecycleRepository(client, this.clock, this.idFactory);
    return nested.getAccountDetail(userId);
  }

  private throwReadback(): never {
    throw new Error("ACCOUNT_LIFECYCLE_READBACK_FAILED");
  }
}
