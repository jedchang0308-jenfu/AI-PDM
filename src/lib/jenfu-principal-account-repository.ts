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
  constructor(readonly code: "principal_account_unavailable" | "principal_account_missing" |
    "principal_account_inactive" | "principal_account_conflict" = "principal_account_unavailable") {
    super(code);
  }
}

export type JenfuAuthorizedFirstLoginInput = {
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  accountType: "human_personal" | "human_privileged";
  mappingVersion: number;
  publishedAt: string;
  verifiedEmail: string;
};

export type JenfuAuthorizedFirstLoginReceipt = {
  created: boolean;
  principalId: string;
  pdmUserId: string;
  companyId: string;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  lifecycleVersion: number;
  profileVersion: number;
};

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
    if (!row) throw new JenfuPrincipalAccountError("principal_account_missing");
    try {
      const lifecycleVersion = Number(row.lifecycle_version);
      const profileVersion = Number(row.profile_version);
      if (row.principal_id !== principalId || !validIdentifier(row.pdm_user_id) || !validIdentifier(row.employee_id) ||
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

  async ensureFirstLogin(input: JenfuAuthorizedFirstLoginInput): Promise<JenfuAuthorizedFirstLoginReceipt> {
    if (this.client.kind !== "postgres" || typeof input.identityIssuer !== "string" ||
      input.identityIssuer.length < 1 || input.identityIssuer.length > 2048 ||
      input.identityIssuer.trim() !== input.identityIssuer ||
      !validIdentifier(input.identitySubject) || !validIdentifier(input.principalId) ||
      !validIdentifier(input.employeeId) || !["human_personal", "human_privileged"].includes(input.accountType) ||
      !Number.isSafeInteger(input.mappingVersion) || input.mappingVersion < 1 ||
      !Number.isFinite(Date.parse(input.publishedAt)) || typeof input.verifiedEmail !== "string" ||
      input.verifiedEmail.length < 3 || input.verifiedEmail.length > 320 ||
      input.verifiedEmail.trim() !== input.verifiedEmail || !input.verifiedEmail.includes("@")) {
      throw new JenfuPrincipalAccountError();
    }
    let result: unknown;
    try {
      const row = await this.client.queryOne<{ receipt: unknown }>(`
        SELECT ai_pdm_core.ensure_authorized_first_login_account_v1(
          :identityIssuer,:identitySubject,:principalId,:employeeId,:accountType,
          :mappingVersion,:publishedAt::timestamptz,:verifiedEmail
        ) AS receipt
      `, input);
      result = row?.receipt;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error &&
        (error.code === "40001" || error.code === "40P01")) throw error;
      const message = error instanceof Error ? error.message : "";
      if (message.includes("AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT")) {
        throw new JenfuPrincipalAccountError("principal_account_conflict");
      }
      throw new JenfuPrincipalAccountError();
    }
    if (!result || typeof result !== "object") throw new JenfuPrincipalAccountError();
    const receipt = result as Partial<JenfuAuthorizedFirstLoginReceipt>;
    const lifecycleVersion = Number(receipt.lifecycleVersion);
    const profileVersion = Number(receipt.profileVersion);
    if (typeof receipt.created !== "boolean" || receipt.principalId !== input.principalId ||
      !validIdentifier(receipt.pdmUserId) || receipt.companyId !== "company-jenfu" ||
      !["active", "suspended", "expired", "offboarded"].includes(String(receipt.accountStatus)) ||
      !validVersion(lifecycleVersion) || !validVersion(profileVersion)) {
      throw new JenfuPrincipalAccountError();
    }
    return { ...receipt, lifecycleVersion, profileVersion } as JenfuAuthorizedFirstLoginReceipt;
  }
}
