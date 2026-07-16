import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";

export type EmployeeLoginProviderRoute = "firebase_google";
export type EmployeeLoginAliasStatus = "active" | "retired";

export type EmployeeLoginAlias = {
  id: string;
  companyId: string;
  aliasType: "employee_number";
  aliasNormalized: string;
  pdmUserId: string;
  providerRoute: EmployeeLoginProviderRoute;
  status: EmployeeLoginAliasStatus;
  createdAt: string;
  createdBy: string;
  retiredAt: string | null;
  retiredBy: string | null;
  reason: string;
  rowVersion: number;
};

export type EmployeeLoginIntentChallenge = {
  accepted: true;
  intentToken: string;
  providerRoute: EmployeeLoginProviderRoute;
  expiresInSeconds: number;
};

type AliasRow = {
  id: string;
  company_id: string;
  alias_type: "employee_number";
  alias_normalized: string;
  pdm_user_id: string;
  provider_route: EmployeeLoginProviderRoute;
  status: EmployeeLoginAliasStatus;
  created_at: string | Date;
  created_by: string;
  retired_at: string | Date | null;
  retired_by: string | null;
  reason: string;
  row_version: number | string;
};

type IntentTargetRow = {
  alias_id: string;
  company_id: string;
  pdm_user_id: string;
  provider_route: EmployeeLoginProviderRoute;
};

type IntentRow = IntentTargetRow & {
  id: string;
  status: "pending" | "used" | "expired";
  expires_at: string | Date;
};

type RateLimitRow = {
  window_started_at: string | Date;
  attempt_count: number | string;
  blocked_until: string | Date | null;
};

const ALIAS_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,31}$/u;
const INTENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/u;
const INTENT_TTL_SECONDS = 5 * 60;
const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_BLOCK_SECONDS = 10 * 60;
const RATE_MAX_ATTEMPTS = 5;

const SELECT_ALIAS_SQL = `
  SELECT id, company_id, alias_type, alias_normalized, pdm_user_id, provider_route,
         status, created_at, created_by, retired_at, retired_by, reason, row_version
  FROM employee_login_aliases
  WHERE id = :aliasId
`;

const SELECT_TARGET_USER_SQL = `
  SELECT id, company_id, account_status, system_role_enabled
  FROM users
  WHERE id = :userId
`;

const INSERT_ALIAS_SQL = `
  INSERT INTO employee_login_aliases (
    id, company_id, alias_type, alias_normalized, pdm_user_id, provider_route,
    status, created_at, created_by, retired_at, retired_by, reason, row_version
  ) VALUES (
    :id, :companyId, 'employee_number', :aliasNormalized, :pdmUserId, 'firebase_google',
    'active', :createdAt, :createdBy, NULL, NULL, :reason, 1
  )
`;

const RETIRE_ALIAS_SQL = `
  UPDATE employee_login_aliases
  SET status = 'retired',
      retired_at = :retiredAt,
      retired_by = :retiredBy,
      reason = :reason,
      row_version = row_version + 1
  WHERE id = :aliasId
    AND company_id = :companyId
    AND status = 'active'
    AND row_version = :rowVersion
`;

const SELECT_ACTIVE_ALIAS_TARGET_SQL = `
  SELECT a.id AS alias_id, a.company_id, a.pdm_user_id, a.provider_route
  FROM employee_login_aliases a
  JOIN users u ON u.id = a.pdm_user_id
  JOIN platform_principal_mappings p ON p.pdm_user_id = u.id
  WHERE a.company_id = :companyId
    AND a.alias_normalized = :aliasNormalized
    AND a.status = 'active'
    AND u.company_id = a.company_id
    AND u.account_status = 'active'
    AND u.system_role_enabled = 1
    AND p.mapping_status = 'active'
  LIMIT 1
`;

const INSERT_INTENT_SQL = `
  INSERT INTO employee_login_intents (
    id, alias_id, company_id, pdm_user_id, provider_route, token_hash,
    return_path, status, created_at, expires_at, used_at
  ) VALUES (
    :id, :aliasId, :companyId, :pdmUserId, :providerRoute, :tokenHash,
    :returnPath, 'pending', :createdAt, :expiresAt, NULL
  )
`;

const EXPIRE_INTENTS_SQL = `
  UPDATE employee_login_intents
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= :now
`;

const SELECT_INTENT_FOR_CONSUMPTION_SQL = `
  SELECT i.id, i.alias_id, i.company_id, i.pdm_user_id, i.provider_route, i.status, i.expires_at
  FROM employee_login_intents i
  JOIN employee_login_aliases a ON a.id = i.alias_id
  JOIN users u ON u.id = i.pdm_user_id
  JOIN platform_principal_mappings p ON p.pdm_user_id = u.id
  WHERE i.token_hash = :tokenHash
    AND i.status = 'pending'
    AND i.expires_at > :now
    AND a.status = 'active'
    AND a.company_id = i.company_id
    AND a.pdm_user_id = i.pdm_user_id
    AND u.account_status = 'active'
    AND u.system_role_enabled = 1
    AND p.mapping_status = 'active'
  LIMIT 1
`;

const CONSUME_INTENT_SQL = `
  UPDATE employee_login_intents
  SET status = 'used', used_at = :usedAt
  WHERE id = :id
    AND status = 'pending'
    AND expires_at > :usedAt
`;

const SELECT_RATE_LIMIT_SQL = `
  SELECT window_started_at, attempt_count, blocked_until
  FROM employee_login_rate_limits
  WHERE company_id = :companyId AND identifier_hash = :identifierHash
`;

const UPSERT_RATE_LIMIT_SQL = `
  INSERT INTO employee_login_rate_limits (
    company_id, identifier_hash, window_started_at, attempt_count, blocked_until, updated_at
  ) VALUES (
    :companyId, :identifierHash, :windowStartedAt, :attemptCount, :blockedUntil, :updatedAt
  )
  ON CONFLICT(company_id, identifier_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN employee_login_rate_limits.window_started_at <= :windowCutoff THEN excluded.window_started_at
      ELSE employee_login_rate_limits.window_started_at
    END,
    attempt_count = CASE
      WHEN employee_login_rate_limits.window_started_at <= :windowCutoff THEN 1
      ELSE employee_login_rate_limits.attempt_count + 1
    END,
    blocked_until = CASE
      WHEN employee_login_rate_limits.blocked_until > :updatedAt THEN employee_login_rate_limits.blocked_until
      WHEN employee_login_rate_limits.window_started_at <= :windowCutoff THEN NULL
      WHEN employee_login_rate_limits.attempt_count + 1 > :maxAttempts THEN :newBlockedUntil
      ELSE NULL
    END,
    updated_at = excluded.updated_at
`;

function isoTimestamp(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function mapAlias(row: AliasRow): EmployeeLoginAlias {
  return {
    id: row.id,
    companyId: row.company_id,
    aliasType: row.alias_type,
    aliasNormalized: row.alias_normalized,
    pdmUserId: row.pdm_user_id,
    providerRoute: row.provider_route,
    status: row.status,
    createdAt: isoTimestamp(row.created_at) ?? String(row.created_at),
    createdBy: row.created_by,
    retiredAt: isoTimestamp(row.retired_at),
    retiredBy: row.retired_by,
    reason: row.reason,
    rowVersion: Number(row.row_version)
  };
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validInternalReturnPath(value: string | undefined) {
  const candidate = value?.trim() || "/";
  if (candidate.length > 512 || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/";
  return candidate;
}

function uniqueAliasViolation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:unique|duplicate).*(?:employee_login_aliases|company_id|alias_normalized)/iu.test(message);
}

export function normalizeEmployeeLoginAlias(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!ALIAS_PATTERN.test(normalized)) {
    throw new EmployeeLoginAliasError("employee_login_alias_invalid", "工號須為 2 至 32 碼英數字，可使用句點、底線或連字號。", 400);
  }
  return normalized;
}

export class EmployeeLoginAliasError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
    this.name = "EmployeeLoginAliasError";
  }
}

export class EmployeeLoginAliasAsyncRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly options: {
      clock?: () => string;
      idFactory?: () => string;
      tokenFactory?: () => string;
      rateLimitPepper: string;
    }
  ) {
    if (options.rateLimitPepper.length < 32) throw new Error("EMPLOYEE_LOGIN_RATE_LIMIT_PEPPER_TOO_SHORT");
  }

  private now() {
    return this.options.clock?.() ?? new Date().toISOString();
  }

  private id() {
    return this.options.idFactory?.() ?? crypto.randomUUID();
  }

  private token() {
    return this.options.tokenFactory?.() ?? crypto.randomBytes(32).toString("base64url");
  }

  async createAlias(input: {
    actorId: string;
    actorCompanyId: string;
    pdmUserId: string;
    alias: string;
    reason: string;
  }): Promise<EmployeeLoginAlias> {
    const aliasNormalized = normalizeEmployeeLoginAlias(input.alias);
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) {
      throw new EmployeeLoginAliasError("employee_login_alias_reason_invalid", "請填寫 1 至 500 字的新增原因。", 400);
    }
    const now = this.now();
    return this.client.transaction(async (client) => {
      const user = await client.queryOne<{ id: string; company_id: string; account_status: string; system_role_enabled: number | boolean }>(SELECT_TARGET_USER_SQL, {
        userId: input.pdmUserId
      });
      if (!user || user.company_id !== input.actorCompanyId) {
        throw new EmployeeLoginAliasError("employee_login_alias_target_not_found", "找不到同一工作區內的指定帳號。", 404);
      }
      if (user.account_status !== "active" || Number(user.system_role_enabled) !== 1) {
        throw new EmployeeLoginAliasError("employee_login_alias_target_inactive", "只能為可使用的帳號新增工號別名。", 409);
      }

      const id = `login-alias-${this.id()}`;
      try {
        await client.execute(INSERT_ALIAS_SQL, {
          id,
          companyId: input.actorCompanyId,
          aliasNormalized,
          pdmUserId: input.pdmUserId,
          createdAt: now,
          createdBy: input.actorId,
          reason
        });
      } catch (error) {
        if (uniqueAliasViolation(error)) {
          throw new EmployeeLoginAliasError("employee_login_alias_conflict", "此工作區已有相同工號或保留中的歷史工號。", 409);
        }
        throw error;
      }
      await new AsyncAuditRepository(client, () => now).createAuditLog({
        actorId: input.actorId,
        action: "EmployeeLoginAliasCreated",
        detail: { aliasId: id, companyId: input.actorCompanyId, pdmUserId: input.pdmUserId, providerRoute: "firebase_google", reason }
      });
      const created = await client.queryOne<AliasRow>(SELECT_ALIAS_SQL, { aliasId: id });
      if (!created) throw new Error("EMPLOYEE_LOGIN_ALIAS_CREATE_READBACK_FAILED");
      return mapAlias(created);
    });
  }

  async retireAlias(input: {
    actorId: string;
    actorCompanyId: string;
    pdmUserId: string;
    aliasId: string;
    rowVersion: number;
    reason: string;
  }): Promise<EmployeeLoginAlias> {
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) {
      throw new EmployeeLoginAliasError("employee_login_alias_reason_invalid", "請填寫 1 至 500 字的退役原因。", 400);
    }
    if (!Number.isInteger(input.rowVersion) || input.rowVersion < 1) {
      throw new EmployeeLoginAliasError("employee_login_alias_version_invalid", "工號別名版本不正確，請重新整理後再試。", 400);
    }
    const now = this.now();
    return this.client.transaction(async (client) => {
      const current = await client.queryOne<AliasRow>(SELECT_ALIAS_SQL, { aliasId: input.aliasId });
      if (!current || current.company_id !== input.actorCompanyId || current.pdm_user_id !== input.pdmUserId) {
        throw new EmployeeLoginAliasError("employee_login_alias_not_found", "找不到指定工號別名。", 404);
      }
      if (current.status !== "active") {
        throw new EmployeeLoginAliasError("employee_login_alias_already_retired", "此工號別名已退役。", 409);
      }
      await client.execute(RETIRE_ALIAS_SQL, {
        aliasId: current.id,
        companyId: input.actorCompanyId,
        rowVersion: input.rowVersion,
        retiredAt: now,
        retiredBy: input.actorId,
        reason
      });
      const retired = await client.queryOne<AliasRow>(SELECT_ALIAS_SQL, { aliasId: current.id });
      if (!retired || retired.status !== "retired" || Number(retired.row_version) !== input.rowVersion + 1) {
        throw new EmployeeLoginAliasError("employee_login_alias_version_conflict", "工號別名已被其他人更新，請重新整理後再試。", 409);
      }
      await new AsyncAuditRepository(client, () => now).createAuditLog({
        actorId: input.actorId,
        action: "EmployeeLoginAliasRetired",
        detail: { aliasId: current.id, companyId: input.actorCompanyId, pdmUserId: current.pdm_user_id, reason }
      });
      return mapAlias(retired);
    });
  }

  async issueIntent(input: {
    companyId: string;
    identifier: string;
    clientKey: string;
    returnPath?: string;
  }): Promise<EmployeeLoginIntentChallenge> {
    const now = this.now();
    const nowMs = Date.parse(now);
    const rawIdentifier = input.identifier.trim().slice(0, 128);
    let aliasNormalized = "";
    try {
      aliasNormalized = normalizeEmployeeLoginAlias(rawIdentifier);
    } catch {
      aliasNormalized = "";
    }
    const identifierHash = crypto.createHmac("sha256", this.options.rateLimitPepper).update(`identifier\n${input.companyId}\n${rawIdentifier.toUpperCase()}`).digest("hex");
    const clientHash = crypto.createHmac("sha256", this.options.rateLimitPepper).update(`client\n${input.companyId}\n${input.clientKey.slice(0, 256)}`).digest("hex");
    const intentToken = this.token();

    const rateLimited = await this.client.transaction(async (client) => {
      const identifierBlocked = await this.applyRateLimit(client, { companyId: input.companyId, identifierHash, now, nowMs });
      const clientBlocked = await this.applyRateLimit(client, { companyId: input.companyId, identifierHash: clientHash, now, nowMs });
      const blocked = identifierBlocked || clientBlocked;
      if (blocked || !aliasNormalized) return blocked;
      const target = await client.queryOne<IntentTargetRow>(SELECT_ACTIVE_ALIAS_TARGET_SQL, {
        companyId: input.companyId,
        aliasNormalized
      });
      if (!target) return false;
      await client.execute(INSERT_INTENT_SQL, {
        id: `login-intent-${this.id()}`,
        aliasId: target.alias_id,
        companyId: target.company_id,
        pdmUserId: target.pdm_user_id,
        providerRoute: target.provider_route,
        tokenHash: tokenHash(intentToken),
        returnPath: validInternalReturnPath(input.returnPath),
        createdAt: now,
        expiresAt: new Date(nowMs + INTENT_TTL_SECONDS * 1000).toISOString()
      });
      return false;
    });
    if (rateLimited) {
      throw new EmployeeLoginAliasError("employee_login_rate_limited", "登入嘗試過於頻繁，請稍後再試。", 429);
    }

    return { accepted: true, intentToken, providerRoute: "firebase_google", expiresInSeconds: INTENT_TTL_SECONDS };
  }

  async consumeIntent(input: { intentToken: string; pdmUserId: string; companyId: string }): Promise<void> {
    const normalized = input.intentToken.trim();
    if (!INTENT_TOKEN_PATTERN.test(normalized)) {
      throw new EmployeeLoginAliasError("employee_login_intent_invalid", "登入要求無效或已失效。", 403);
    }
    const now = this.now();
    await this.client.transaction(async (client) => {
      await client.execute(EXPIRE_INTENTS_SQL, { now });
      const intent = await client.queryOne<IntentRow>(SELECT_INTENT_FOR_CONSUMPTION_SQL, {
        tokenHash: tokenHash(normalized),
        now
      });
      if (!intent || intent.company_id !== input.companyId || intent.pdm_user_id !== input.pdmUserId) {
        throw new EmployeeLoginAliasError("employee_login_intent_invalid", "登入要求無效或已失效。", 403);
      }
      await client.execute(CONSUME_INTENT_SQL, { id: intent.id, usedAt: now });
      const consumed = await client.queryOne<{ status: string }>("SELECT status FROM employee_login_intents WHERE id = :id", { id: intent.id });
      if (consumed?.status !== "used") {
        throw new EmployeeLoginAliasError("employee_login_intent_invalid", "登入要求無效或已失效。", 403);
      }
    });
  }

  private async applyRateLimit(
    client: AsyncDatabaseClient,
    input: { companyId: string; identifierHash: string; now: string; nowMs: number }
  ): Promise<boolean> {
    const windowCutoff = new Date(input.nowMs - RATE_WINDOW_SECONDS * 1000).toISOString();
    const newBlockedUntil = new Date(input.nowMs + RATE_BLOCK_SECONDS * 1000).toISOString();
    await client.execute(UPSERT_RATE_LIMIT_SQL, {
      companyId: input.companyId,
      identifierHash: input.identifierHash,
      windowStartedAt: input.now,
      attemptCount: 1,
      blockedUntil: null,
      updatedAt: input.now,
      windowCutoff,
      maxAttempts: RATE_MAX_ATTEMPTS,
      newBlockedUntil
    });
    const current = await client.queryOne<RateLimitRow>(SELECT_RATE_LIMIT_SQL, {
      companyId: input.companyId,
      identifierHash: input.identifierHash
    });
    const blockedUntilMs = current?.blocked_until ? Date.parse(String(current.blocked_until)) : 0;
    return Number.isFinite(blockedUntilMs) && blockedUntilMs > input.nowMs;
  }
}
