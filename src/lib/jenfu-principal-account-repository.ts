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
  minimumAssurance: "aal1";
  sessionInvalidBefore: string | null;
};

export class JenfuPrincipalAccountError extends Error {
  constructor(readonly code: "principal_account_unavailable" | "principal_account_inactive" = "principal_account_unavailable") {
    super(code);
  }
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

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 255 && value.trim() === value;
}

function validVersion(value: unknown): boolean {
  return (typeof value === "number" || (typeof value === "string" && /^[1-9][0-9]*$/u.test(value))) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 1;
}

export class JenfuPrincipalAccountRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "queryOne">) {}

  async requireActive(principalId: string): Promise<JenfuPrincipalAccount> {
    if (this.client.kind !== "postgres" || !principalId || principalId.length > 255) throw new JenfuPrincipalAccountError();
    let row: Row | null;
    try {
      row = await this.client.queryOne<Row>(`
        SELECT account.principal_id, account.pdm_user_id, account.employee_id,
               account.account_type, account.company_id, account.lifecycle_version,
               account.profile_version, account.account_status, account.system_role_enabled,
               account.minimum_assurance, account.session_invalid_before
        FROM ai_pdm_core.principal_accounts account
        JOIN ai_pdm_core.users profile ON profile.id = account.pdm_user_id
          AND profile.company_id = account.company_id
        WHERE account.principal_id = :principalId
      `, { principalId });
    } catch {
      throw new JenfuPrincipalAccountError();
    }
    try {
      const lifecycleVersion = Number(row?.lifecycle_version);
      const profileVersion = Number(row?.profile_version);
      if (!row || row.principal_id !== principalId || !validIdentifier(row.pdm_user_id) || !validIdentifier(row.employee_id) ||
        !validIdentifier(row.company_id) || !["active", "suspended", "expired", "offboarded"].includes(row.account_status) ||
        ![true, false, 1, 0].includes(row.system_role_enabled) ||
        !["human_personal", "human_privileged"].includes(row.account_type) ||
        row.minimum_assurance !== "aal1" ||
        !validVersion(row.lifecycle_version) || !validVersion(row.profile_version) ||
        (row.session_invalid_before != null && typeof row.session_invalid_before !== "string" &&
          !(row.session_invalid_before instanceof Date))) throw new Error("principal account invalid");
      const sessionInvalidBefore = row.session_invalid_before == null ? null : new Date(row.session_invalid_before).toISOString();
      // A validated owner row that denies admission is not a failed dependency.
      // Validate its identity, versions and barrier before classifying inactivity.
      if (row.account_status !== "active" || row.system_role_enabled === false || row.system_role_enabled === 0) {
        throw new JenfuPrincipalAccountError("principal_account_inactive");
      }
      return {
        principalId: row.principal_id, pdmUserId: row.pdm_user_id,
        employeeId: row.employee_id, accountType: row.account_type as JenfuPrincipalAccount["accountType"],
        companyId: row.company_id, lifecycleVersion, profileVersion,
        accountStatus: "active", systemRoleEnabled: true,
        minimumAssurance: row.minimum_assurance as JenfuPrincipalAccount["minimumAssurance"],
        sessionInvalidBefore,
      };
    } catch (error) {
      if (error instanceof JenfuPrincipalAccountError) throw error;
      throw new JenfuPrincipalAccountError();
    }
  }
}
