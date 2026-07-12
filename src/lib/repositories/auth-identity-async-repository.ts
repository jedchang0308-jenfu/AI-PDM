import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUserWithPassword } from "@/lib/repositories/user-repository";

export type AuthIdentityProvider = "local_password" | "google_oauth" | "invite";
export type AuthIdentityStatus = "active" | "disabled";

type AuthIdentityRow = {
  identity_id: string;
  user_id: string;
  provider: AuthIdentityProvider;
  provider_subject: string;
  login_identifier: string | null;
  email_normalized: string | null;
  identity_status: AuthIdentityStatus;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: DbUserWithPassword["role"];
  company_id: string;
  account_status: DbUserWithPassword["account_status"];
};

export type ResolvedAuthIdentity = {
  identityId: string;
  provider: AuthIdentityProvider;
  providerSubject: string;
  loginIdentifier: string | null;
  emailNormalized: string | null;
  status: AuthIdentityStatus;
  user: DbUserWithPassword;
};

export type AuthIdentityErrorCode = "identity_already_linked" | "user_provider_already_linked";

export class AuthIdentityError extends Error {
  constructor(readonly code: AuthIdentityErrorCode, message: string) {
    super(message);
    this.name = "AuthIdentityError";
  }
}

const AUTH_IDENTITY_SELECT = `
  SELECT
    identity.id AS identity_id,
    identity.user_id,
    identity.provider,
    identity.provider_subject,
    identity.login_identifier,
    identity.email_normalized,
    identity.status AS identity_status,
    users.display_name,
    users.email,
    users.password_hash,
    users.role,
    users.company_id,
    users.account_status
  FROM auth_identities identity
  JOIN users ON users.id = identity.user_id
`;

const SELECT_LOCAL_IDENTITY_SQL = `
  ${AUTH_IDENTITY_SELECT}
  WHERE identity.provider = 'local_password'
    AND identity.login_identifier = :loginIdentifier
  LIMIT 1
`;

const SELECT_GOOGLE_IDENTITY_SQL = `
  ${AUTH_IDENTITY_SELECT}
  WHERE identity.provider = 'google_oauth'
    AND identity.provider_subject = :providerSubject
  LIMIT 1
`;

const SELECT_IDENTITY_BY_SUBJECT_SQL = `
  SELECT id, user_id
  FROM auth_identities
  WHERE provider = :provider
    AND provider_subject = :providerSubject
  LIMIT 1
`;

const SELECT_IDENTITY_BY_USER_PROVIDER_SQL = `
  SELECT id, provider_subject
  FROM auth_identities
  WHERE user_id = :userId
    AND provider = :provider
  LIMIT 1
`;

const INSERT_IDENTITY_SQL = `
  INSERT INTO auth_identities (
    id, user_id, provider, provider_subject, login_identifier, email_normalized,
    verified_at, last_login_at, status, created_at, updated_at
  )
  VALUES (
    :id, :userId, :provider, :providerSubject, :loginIdentifier, :emailNormalized,
    :verifiedAt, :lastLoginAt, 'active', :now, :now
  )
`;

const UPDATE_IDENTITY_SQL = `
  UPDATE auth_identities
  SET login_identifier = :loginIdentifier,
      email_normalized = :emailNormalized,
      verified_at = COALESCE(verified_at, :verifiedAt),
      status = 'active',
      updated_at = :now
  WHERE id = :id
`;

const TOUCH_IDENTITY_LOGIN_SQL = `
  UPDATE auth_identities
  SET email_normalized = COALESCE(:emailNormalized, email_normalized),
      last_login_at = :lastLoginAt,
      updated_at = :lastLoginAt
  WHERE id = :identityId
`;

function mapIdentity(row: AuthIdentityRow): ResolvedAuthIdentity {
  return {
    identityId: row.identity_id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    loginIdentifier: row.login_identifier,
    emailNormalized: row.email_normalized,
    status: row.identity_status,
    user: {
      id: row.user_id,
      display_name: row.display_name,
      email: row.email,
      password_hash: row.password_hash,
      role: row.role,
      company_id: row.company_id,
      account_status: row.account_status
    }
  };
}

function isUniqueConstraintError(error: unknown) {
  if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") return true;
  return error instanceof Error && /unique constraint|UNIQUE constraint failed/iu.test(error.message);
}

export class AsyncAuthIdentityRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => `identity-${crypto.randomUUID()}`
  ) {}

  async resolveLocalPassword(loginIdentifier: string): Promise<ResolvedAuthIdentity | null> {
    const row = await this.client.queryOne<AuthIdentityRow>(SELECT_LOCAL_IDENTITY_SQL, {
      loginIdentifier: loginIdentifier.trim().toLowerCase()
    });
    return row ? mapIdentity(row) : null;
  }

  async resolveGoogle(providerSubject: string): Promise<ResolvedAuthIdentity | null> {
    const row = await this.client.queryOne<AuthIdentityRow>(SELECT_GOOGLE_IDENTITY_SQL, { providerSubject });
    return row ? mapIdentity(row) : null;
  }

  async linkGoogle(input: { userId: string; providerSubject: string; email: string; verifiedAt?: string }): Promise<string> {
    return this.link({
      userId: input.userId,
      provider: "google_oauth",
      providerSubject: input.providerSubject,
      loginIdentifier: input.email,
      email: input.email,
      verifiedAt: input.verifiedAt
    });
  }

  async linkInvite(input: { userId: string; invitationId: string; email: string; verifiedAt?: string }): Promise<string> {
    return this.link({
      userId: input.userId,
      provider: "invite",
      providerSubject: input.invitationId,
      loginIdentifier: input.email,
      email: input.email,
      verifiedAt: input.verifiedAt
    });
  }

  async recordSuccessfulLogin(identityId: string, email?: string | null): Promise<void> {
    const lastLoginAt = this.clock();
    await this.client.execute(TOUCH_IDENTITY_LOGIN_SQL, {
      identityId,
      emailNormalized: email?.trim().toLowerCase() || null,
      lastLoginAt
    });
  }

  private async link(input: {
    userId: string;
    provider: AuthIdentityProvider;
    providerSubject: string;
    loginIdentifier: string | null;
    email: string | null;
    verifiedAt?: string;
  }): Promise<string> {
    const now = this.clock();
    const providerSubject = input.providerSubject.trim();
    const loginIdentifier = input.loginIdentifier?.trim().toLowerCase() || null;
    const emailNormalized = input.email?.trim().toLowerCase() || null;
    const bySubject = await this.client.queryOne<{ id: string; user_id: string }>(SELECT_IDENTITY_BY_SUBJECT_SQL, {
      provider: input.provider,
      providerSubject
    });
    if (bySubject && bySubject.user_id !== input.userId) {
      throw new AuthIdentityError("identity_already_linked", "這個登入身分已連結到其他 PDM 使用者。");
    }

    const byUser = await this.client.queryOne<{ id: string; provider_subject: string }>(SELECT_IDENTITY_BY_USER_PROVIDER_SQL, {
      userId: input.userId,
      provider: input.provider
    });
    if (byUser && byUser.provider_subject !== providerSubject) {
      throw new AuthIdentityError("user_provider_already_linked", "這個 PDM 使用者已連結其他同類登入身分。");
    }

    const existingId = bySubject?.id ?? byUser?.id;
    if (existingId) {
      await this.client.execute(UPDATE_IDENTITY_SQL, {
        id: existingId,
        loginIdentifier,
        emailNormalized,
        verifiedAt: input.verifiedAt ?? now,
        now
      });
      return existingId;
    }

    const id = this.idFactory();
    try {
      await this.client.execute(INSERT_IDENTITY_SQL, {
        id,
        userId: input.userId,
        provider: input.provider,
        providerSubject,
        loginIdentifier,
        emailNormalized,
        verifiedAt: input.verifiedAt ?? now,
        lastLoginAt: input.provider === "invite" ? null : now,
        now
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const concurrentSubject = await this.client.queryOne<{ id: string; user_id: string }>(SELECT_IDENTITY_BY_SUBJECT_SQL, {
        provider: input.provider,
        providerSubject
      });
      if (concurrentSubject?.user_id === input.userId) return concurrentSubject.id;
      if (concurrentSubject) {
        throw new AuthIdentityError("identity_already_linked", "這個登入身分已連結到其他 PDM 使用者。");
      }
      throw new AuthIdentityError("user_provider_already_linked", "這個 PDM 使用者已連結其他同類登入身分。");
    }
    return id;
  }
}
