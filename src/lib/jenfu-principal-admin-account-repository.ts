import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type PrincipalAdminAccount = {
  id: string;
  principalId: string;
  employeeId: string;
  accountType: "human_personal" | "human_privileged";
  displayName: string;
  email: string | null;
  companyId: string;
  companyName: string;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  systemRoleEnabled: boolean;
  lifecycleVersion: number;
  profileVersion: number;
  sessionInvalidBefore: string | null;
};

type AccountRow = {
  id: string; principal_id: string; employee_id: string; account_type: string;
  display_name: string; email: string | null; company_id: string; company_name: string;
  account_status: string; system_role_enabled: boolean;
  lifecycle_version: string | number; profile_version: string | number;
  session_invalid_before: Date | string | null;
};

const SELECT = `
  SELECT profile.id,account.principal_id,account.employee_id,account.account_type,
         profile.display_name,profile.email,account.company_id,
         company.display_name AS company_name,account.account_status,
         account.system_role_enabled,account.lifecycle_version,account.profile_version,
         account.session_invalid_before
  FROM ai_pdm_core.principal_accounts account
  JOIN ai_pdm_core.principal_identity_cutovers cutover
    ON cutover.pdm_user_id=account.pdm_user_id
   AND cutover.principal_id=account.principal_id
   AND cutover.status='principal_active'
  JOIN ai_pdm_core.users profile
    ON profile.id=account.pdm_user_id AND profile.company_id=account.company_id
  JOIN ai_pdm_core.companies company ON company.id=account.company_id
`;

function parse(row: AccountRow): PrincipalAdminAccount {
  const lifecycleVersion = Number(row.lifecycle_version);
  const profileVersion = Number(row.profile_version);
  if (!row.id || !row.principal_id || !row.employee_id ||
      typeof row.display_name !== "string" ||
      !row.company_id || !row.company_name ||
      !["human_personal", "human_privileged"].includes(row.account_type) ||
      !["active", "suspended", "expired", "offboarded"].includes(row.account_status) ||
      typeof row.system_role_enabled !== "boolean" ||
      !Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 1 ||
      !Number.isSafeInteger(profileVersion) || profileVersion < 1) {
    throw new Error("PRINCIPAL_ADMIN_ACCOUNT_CONTRACT_INVALID");
  }
  const invalidBefore = row.session_invalid_before == null ? null :
    new Date(row.session_invalid_before).toISOString();
  return { id: row.id, principalId: row.principal_id, employeeId: row.employee_id,
    accountType: row.account_type as PrincipalAdminAccount["accountType"],
    displayName: row.display_name || row.id, email: row.email, companyId: row.company_id,
    companyName: row.company_name, accountStatus: row.account_status as PrincipalAdminAccount["accountStatus"],
    systemRoleEnabled: row.system_role_enabled, lifecycleVersion, profileVersion,
    sessionInvalidBefore: invalidBefore };
}

/** Current principal account projection. Historical users security columns never enter it. */
export class JenfuPrincipalAdminAccountRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "query" | "queryOne">) {}

  async list(companyId: string, input: { query?: string; status?: string; limit?: number } = {}) {
    if (this.client.kind !== "postgres" || !companyId || companyId.length > 255 ||
        (input.status && !["active", "suspended", "expired", "offboarded"].includes(input.status)) ||
        (input.query && input.query.length > 255)) throw new Error("PRINCIPAL_ADMIN_ACCOUNT_REQUEST_INVALID");
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("PRINCIPAL_ADMIN_ACCOUNT_REQUEST_INVALID");
    }
    const query = input.query?.trim().toLowerCase() || null;
    const rows = await this.client.query<AccountRow>(`${SELECT}
      WHERE account.company_id=:companyId
        AND (:status::text IS NULL OR account.account_status=:status)
        AND (:query::text IS NULL OR strpos(lower(profile.display_name),:query)>0
             OR strpos(lower(coalesce(profile.email,'')),:query)>0
             OR strpos(lower(account.principal_id),:query)>0)
      ORDER BY account.updated_at DESC,account.principal_id
      LIMIT :limit
    `, { companyId, status: input.status || null, query, limit });
    return rows.map(parse);
  }

  async getByProfile(companyId: string, pdmUserId: string): Promise<PrincipalAdminAccount | null> {
    if (this.client.kind !== "postgres" || !companyId || !pdmUserId ||
        companyId.length > 255 || pdmUserId.length > 255) {
      throw new Error("PRINCIPAL_ADMIN_ACCOUNT_REQUEST_INVALID");
    }
    const row = await this.client.queryOne<AccountRow>(`${SELECT}
      WHERE account.company_id=:companyId AND account.pdm_user_id=:pdmUserId
    `, { companyId, pdmUserId });
    return row ? parse(row) : null;
  }
}
