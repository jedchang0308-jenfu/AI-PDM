import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DbUser, DbUserWithPassword } from "@/lib/repositories/user-repository";

type UserRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: DbUser["role"];
  company_id: string;
  account_status: DbUser["account_status"];
  session_invalid_before: string | null;
  account_lifecycle_version: number;
  system_role_enabled: number | boolean;
  account_status_changed_at: string | null;
  account_status_changed_by: string | null;
  account_status_reason: string | null;
};

type UserWithPasswordRow = UserRow & {
  password_hash: string | null;
};

export const SELECT_ASYNC_USER_BY_ID_SQL = `
  SELECT id, display_name, email, role, company_id, account_status,
         session_invalid_before, account_lifecycle_version, system_role_enabled,
         account_status_changed_at, account_status_changed_by, account_status_reason
  FROM users
  WHERE id = :id
`;

export const SELECT_ASYNC_USER_BY_EMAIL_SQL = `
  SELECT id, display_name, email, role, company_id, account_status,
         session_invalid_before, account_lifecycle_version, system_role_enabled,
         account_status_changed_at, account_status_changed_by, account_status_reason
  FROM users
  WHERE lower(email) = lower(:email)
`;

export const SELECT_ASYNC_USER_BY_EMAIL_WITH_PASSWORD_SQL = `
  SELECT id, display_name, email, password_hash, role, company_id, account_status,
         session_invalid_before, account_lifecycle_version, system_role_enabled,
         account_status_changed_at, account_status_changed_by, account_status_reason
  FROM users
  WHERE lower(email) = lower(:email)
`;

export const UPSERT_ASYNC_USER_SQL = `
  INSERT INTO users (id, display_name, email, password_hash, role, company_id, created_at, updated_at)
  VALUES (:id, :displayName, :email, :passwordHash, :role, :companyId, :now, :now)
  ON CONFLICT(email) DO UPDATE SET
    display_name = excluded.display_name,
    password_hash = excluded.password_hash,
    role = excluded.role,
    company_id = excluded.company_id,
    updated_at = excluded.updated_at
`;

export const INSERT_ASYNC_USER_SQL = `
  INSERT INTO users (id, display_name, email, password_hash, role, company_id, created_at, updated_at)
  VALUES (:id, :displayName, :email, :passwordHash, :role, :companyId, :now, :now)
`;

export const UPDATE_ASYNC_USER_PASSWORD_SQL = `
  UPDATE users
  SET password_hash = :passwordHash,
      updated_at = :now
  WHERE id = :userId
`;

export const RESTORE_ASYNC_DEMO_USER_SQL = `
  UPDATE users
  SET account_status = 'active',
      system_role_enabled = 1,
      session_invalid_before = NULL,
      account_lifecycle_version = account_lifecycle_version + 1,
      account_status_changed_at = :now,
      account_status_changed_by = id,
      account_status_reason = 'Local demo validation account restored',
      updated_at = :now
  WHERE id = :userId
    AND (account_status <> 'active' OR system_role_enabled = 0 OR session_invalid_before IS NOT NULL)
`;

export const RESTORE_ASYNC_DEMO_IDENTITY_SQL = `
  UPDATE auth_identities
  SET status = 'active',
      updated_at = :now
  WHERE user_id = :userId
    AND provider = 'local_password'
`;

export const SELECT_ASYNC_COMPANY_ID_BY_CODE_SQL = `
  SELECT id
  FROM companies
  WHERE upper(company_code) = upper(:companyCode)
`;

export const DELETE_ASYNC_USER_COMPANY_MEMBERSHIPS_SQL = `
  DELETE FROM user_company_memberships
  WHERE user_id = :userId
`;

export const INSERT_ASYNC_USER_COMPANY_MEMBERSHIP_SQL = `
  INSERT INTO user_company_memberships (user_id, company_id, is_default)
  VALUES (:userId, :companyId, :isDefault)
  ON CONFLICT(user_id, company_id) DO UPDATE SET
    is_default = excluded.is_default
`;

export const UPSERT_ASYNC_LOCAL_IDENTITY_SQL = `
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

export const SELECT_ASYNC_USER_COMPANY_ACCESS_SQL = `
  SELECT
    c.id AS company_id,
    c.company_code,
    c.company_kind,
    c.display_name,
    m.is_default
  FROM user_company_memberships m
  JOIN companies c ON c.id = m.company_id
  WHERE m.user_id = :userId
  ORDER BY m.is_default DESC, c.company_code ASC
`;

export type UserCompanyAccess = {
  companyId: string;
  companyCode: "JENFU" | "MAXIMA" | "SMOKE" | "STAGING-SMOKE";
  companyKind: "business" | "production_smoke";
  displayName: string;
  is_default: boolean;
};

type UserCompanyAccessRow = {
  company_id: string;
  company_code: string;
  company_kind: string;
  display_name: string;
  is_default: number | boolean;
};

export const SELECT_ASYNC_USER_COMPANY_AUTHORITY_SQL = `
  SELECT
    c.id AS company_id,
    c.company_code,
    c.company_kind,
    m.is_default,
    (
      SELECT COUNT(*)
      FROM user_company_memberships membership_count
      WHERE membership_count.user_id = :userId
    ) AS membership_count,
    ppm.platform_principal_id,
    ppm.mapping_status AS principal_mapping_status,
    pom.platform_organization_id,
    pom.mapping_status AS organization_mapping_status
  FROM companies c
  LEFT JOIN user_company_memberships m
    ON m.company_id = c.id
   AND m.user_id = :userId
  LEFT JOIN platform_principal_mappings ppm
    ON ppm.pdm_user_id = :userId
  LEFT JOIN platform_organization_mappings pom
    ON pom.pdm_company_id = c.id
  WHERE c.id = :companyId
`;

export type UserCompanyAuthority = {
  companyId: string;
  companyCode: UserCompanyAccess["companyCode"];
  companyKind: UserCompanyAccess["companyKind"];
  isDefault: boolean;
  membershipCount: number;
  platformPrincipalId: string | null;
  principalMappingStatus: string | null;
  platformOrganizationId: string | null;
  organizationMappingStatus: string | null;
};

type UserCompanyAuthorityRow = {
  company_id: string;
  company_code: string;
  company_kind: string;
  is_default: number | boolean | null;
  membership_count: number | string;
  platform_principal_id: string | null;
  principal_mapping_status: string | null;
  platform_organization_id: string | null;
  organization_mapping_status: string | null;
};

function parseStoredCompanyCode(value: string): UserCompanyAccess["companyCode"] {
  if (value === "JENFU" || value === "MAXIMA" || value === "SMOKE" || value === "STAGING-SMOKE") return value;
  throw new Error("PDM_COMPANY_CODE_UNSUPPORTED");
}

function parseStoredCompanyKind(value: string): UserCompanyAccess["companyKind"] {
  if (value === "business" || value === "production_smoke") return value;
  throw new Error("PDM_COMPANY_KIND_UNSUPPORTED");
}

function assertCompanyIdentityPair(companyCode: UserCompanyAccess["companyCode"], companyKind: UserCompanyAccess["companyKind"]) {
  const isSmokeCode = companyCode === "SMOKE" || companyCode === "STAGING-SMOKE";
  if (isSmokeCode !== (companyKind === "production_smoke")) {
    throw new Error("PDM_COMPANY_IDENTITY_PAIR_INVALID");
  }
}

export class AsyncUserRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getUserById(id: string): Promise<DbUser | null> {
    return this.client.queryOne<UserRow>(SELECT_ASYNC_USER_BY_ID_SQL, { id });
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    return this.client.queryOne<UserRow>(SELECT_ASYNC_USER_BY_EMAIL_SQL, { email });
  }

  async getUserByEmailWithPassword(email: string): Promise<DbUserWithPassword | null> {
    return this.client.queryOne<UserWithPasswordRow>(SELECT_ASYNC_USER_BY_EMAIL_WITH_PASSWORD_SQL, { email });
  }

  async upsertUser(input: {
    id: string;
    displayName: string;
    email: string;
    passwordHash: string;
    role: DbUser["role"];
    companyCodes?: string[];
    now?: string;
  }): Promise<void> {
    const companyIds = await this.resolveCompanyIds(input.companyCodes ?? (input.role === "Admin" ? ["JENFU", "MAXIMA"] : ["JENFU"]));
    await this.client.execute(UPSERT_ASYNC_USER_SQL, {
      id: input.id,
      displayName: input.displayName,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      companyId: companyIds[0],
      now: input.now ?? new Date().toISOString()
    });
    const storedUser = await this.getUserByEmail(input.email);
    if (!storedUser) throw new Error("ASYNC_USER_UPSERT_READBACK_FAILED");
    await this.replaceCompanyMemberships(storedUser.id, companyIds);
    await this.upsertLocalPasswordIdentity(storedUser.id, input.email, input.now);
  }

  async createUser(input: {
    displayName: string;
    email: string;
    passwordHash: string | null;
    role: DbUser["role"];
    companyCodes?: string[];
    id?: string;
    now?: string;
  }): Promise<string> {
    const id = input.id ?? `user-${crypto.randomUUID().slice(0, 12)}`;
    const companyIds = await this.resolveCompanyIds(input.companyCodes ?? ["JENFU"]);
    await this.client.execute(INSERT_ASYNC_USER_SQL, {
      id,
      displayName: input.displayName,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      companyId: companyIds[0],
      now: input.now ?? new Date().toISOString()
    });
    await this.replaceCompanyMemberships(id, companyIds);
    if (input.passwordHash) await this.upsertLocalPasswordIdentity(id, input.email, input.now);
    return id;
  }

  async updateUserPassword(userId: string, passwordHash: string, now = new Date().toISOString()): Promise<void> {
    await this.client.execute(UPDATE_ASYNC_USER_PASSWORD_SQL, { userId, passwordHash, now });
    const user = await this.getUserById(userId);
    if (user?.email) await this.upsertLocalPasswordIdentity(user.id, user.email, now);
  }

  async restoreDemoUserForLocalValidation(userId: string, now = new Date().toISOString()): Promise<void> {
    await this.client.execute(RESTORE_ASYNC_DEMO_USER_SQL, { userId, now });
    await this.client.execute(RESTORE_ASYNC_DEMO_IDENTITY_SQL, { userId, now });
  }

  async listUserCompanyAccess(userId: string): Promise<UserCompanyAccess[]> {
    const rows = await this.client.query<UserCompanyAccessRow>(SELECT_ASYNC_USER_COMPANY_ACCESS_SQL, { userId });
    return rows.map((row) => {
      const companyCode = parseStoredCompanyCode(row.company_code);
      const companyKind = parseStoredCompanyKind(row.company_kind);
      assertCompanyIdentityPair(companyCode, companyKind);
      return {
        companyId: row.company_id,
        companyCode,
        companyKind,
        displayName: row.display_name,
        is_default: Boolean(Number(row.is_default))
      };
    });
  }

  async getUserCompanyAuthority(userId: string, companyId: string): Promise<UserCompanyAuthority | null> {
    const row = await this.client.queryOne<UserCompanyAuthorityRow>(SELECT_ASYNC_USER_COMPANY_AUTHORITY_SQL, {
      userId,
      companyId
    });
    if (!row) return null;
    const companyCode = parseStoredCompanyCode(row.company_code);
    const companyKind = parseStoredCompanyKind(row.company_kind);
    assertCompanyIdentityPair(companyCode, companyKind);
    return {
      companyId: row.company_id,
      companyCode,
      companyKind,
      isDefault: Boolean(Number(row.is_default ?? 0)),
      membershipCount: Number(row.membership_count),
      platformPrincipalId: row.platform_principal_id,
      principalMappingStatus: row.principal_mapping_status,
      platformOrganizationId: row.platform_organization_id,
      organizationMappingStatus: row.organization_mapping_status
    };
  }

  private async resolveCompanyIds(companyCodes: string[]): Promise<string[]> {
    if (companyCodes.length === 0) throw new Error("PDM_COMPANY_CODE_REQUIRED");
    const ids: string[] = [];
    for (const companyCode of companyCodes) {
      const normalized = companyCode.trim().toUpperCase();
      if (!normalized) throw new Error("PDM_COMPANY_CODE_REQUIRED");
      const row = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_COMPANY_ID_BY_CODE_SQL, { companyCode: normalized });
      if (!row) throw new Error("PDM_COMPANY_CODE_NOT_FOUND");
      if (!ids.includes(row.id)) ids.push(row.id);
    }
    return ids;
  }

  private async replaceCompanyMemberships(userId: string, companyIds: string[]): Promise<void> {
    await this.client.execute(DELETE_ASYNC_USER_COMPANY_MEMBERSHIPS_SQL, { userId });
    for (const [index, companyId] of companyIds.entries()) {
      await this.client.execute(INSERT_ASYNC_USER_COMPANY_MEMBERSHIP_SQL, {
        userId,
        companyId,
        isDefault: index === 0 ? 1 : 0
      });
    }
  }

  private async upsertLocalPasswordIdentity(userId: string, email: string, now = new Date().toISOString()): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.client.execute(UPSERT_ASYNC_LOCAL_IDENTITY_SQL, {
      id: `identity-local-${userId}`,
      userId,
      email: normalizedEmail,
      now
    });
  }
}
