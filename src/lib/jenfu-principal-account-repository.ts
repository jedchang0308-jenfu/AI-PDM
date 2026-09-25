import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type JenfuPrincipalAccount = {
  principalId: string;
  pdmUserId: string;
  employeeId: string;
  accountType: "human_personal" | "human_privileged";
  companyId: string;
  lifecycleVersion: number;
  profileVersion: number;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  systemRoleEnabled: boolean;
  minimumAssurance: "aal1" | "aal2";
  sessionInvalidBefore: string | null;
};

export class JenfuPrincipalAccountError extends Error {
  constructor() { super("principal_account_unavailable"); }
}

type Row = {
  principal_id: string;
  pdm_user_id: string;
  employee_id: string;
  account_type: string;
  company_id: string;
  lifecycle_version: number | string;
  profile_version: number | string;
  account_status: string;
  system_role_enabled: boolean | number;
  minimum_assurance: string;
  session_invalid_before: string | Date | null;
};

export class JenfuPrincipalAccountRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "queryOne">) {}

  async requireActive(principalId: string): Promise<JenfuPrincipalAccount> {
    if (this.client.kind !== "postgres" || !principalId || principalId.length > 255) throw new JenfuPrincipalAccountError();
    try {
      const row = await this.client.queryOne<Row>(`
        SELECT account.principal_id, account.pdm_user_id, account.employee_id,
               account.account_type, account.company_id, account.lifecycle_version,
               account.profile_version, account.account_status, account.system_role_enabled,
               account.minimum_assurance, account.session_invalid_before
        FROM ai_pdm_core.principal_accounts account
        JOIN ai_pdm_core.users profile ON profile.id = account.pdm_user_id
          AND profile.company_id = account.company_id
        JOIN ai_pdm_core.principal_identity_cutovers cutover
          ON cutover.pdm_user_id = account.pdm_user_id
         AND cutover.principal_id = account.principal_id
         AND cutover.status = 'principal_active'
        WHERE account.principal_id = :principalId
      `, { principalId });
      const lifecycleVersion = Number(row?.lifecycle_version);
      const profileVersion = Number(row?.profile_version);
      if (!row || row.principal_id !== principalId || !row.pdm_user_id || !row.employee_id ||
        !row.company_id || row.account_status !== "active" ||
        (row.system_role_enabled !== true && row.system_role_enabled !== 1) ||
        !["human_personal", "human_privileged"].includes(row.account_type) ||
        !["aal1", "aal2"].includes(row.minimum_assurance) ||
        (row.account_type === "human_privileged" && row.minimum_assurance !== "aal2") ||
        !Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 1 ||
        !Number.isSafeInteger(profileVersion) || profileVersion < 1) throw new Error("principal account invalid");
      const sessionInvalidBefore = row.session_invalid_before == null ? null : new Date(row.session_invalid_before).toISOString();
      return {
        principalId: row.principal_id, pdmUserId: row.pdm_user_id,
        employeeId: row.employee_id, accountType: row.account_type as JenfuPrincipalAccount["accountType"],
        companyId: row.company_id, lifecycleVersion, profileVersion,
        accountStatus: "active", systemRoleEnabled: true,
        minimumAssurance: row.minimum_assurance as JenfuPrincipalAccount["minimumAssurance"],
        sessionInvalidBefore,
      };
    } catch {
      throw new JenfuPrincipalAccountError();
    }
  }
}
