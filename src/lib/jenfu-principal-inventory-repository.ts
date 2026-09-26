import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION } from "@/lib/jenfu-principal-admission-repository";
import { requirePrincipalCutoverSourceLocks } from "@/lib/jenfu-principal-cutover-locks";

export type PrincipalInventorySource = "firebase_mapping" | "google_oauth";
/** Production accepts firebase_bff; all is an explicit historical-fixture mode. */
export type PrincipalInventorySourcePolicy = "all" | "firebase_bff";

export type PrincipalInventoryCandidate = {
  pdmUserId: string;
  companyId: string;
  principalId: string;
  employeeId: string;
  identityIssuer: string;
  identitySubject: string;
  sourceKind: PrincipalInventorySource;
  mappingVersion: number;
  publishedAt: string;
  accountType: "human_personal" | "human_privileged";
  lifecycleVersion: number;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  systemRoleEnabled: boolean;
  sessionInvalidBefore: string | null;
};

export type PrincipalInventoryInput = Omit<PrincipalInventoryCandidate,
  "accountType" | "lifecycleVersion" | "accountStatus" |
  "systemRoleEnabled" | "sessionInvalidBefore">;

type InventoryRow = {
  id: string;
  company_id: string;
  account_status: string;
  account_lifecycle_version: number | string;
  system_role_enabled: number | boolean;
  session_invalid_before: Date | string | null;
  source_count: number | string;
  source_user_id: string | null;
  profile_source_count: number | string;
  profile_blocker_count: number | string;
  isolation_level: string;
  contract_version: string | null;
  principal_issuer: string | null;
  principal_subject: string | null;
  principal_id: string | null;
  employee_id: string | null;
  employee_status: string | null;
  account_type: string | null;
  mapping_version: number | string | null;
  published_at: Date | string | null;
};

export class PrincipalInventoryError extends Error {
  constructor(readonly code: "principal_inventory_invalid" | "principal_inventory_unavailable" |
    "principal_inventory_mismatch") { super(code); }
}

function exactText(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value.trim() === value && /\S/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

function opaquePrincipal(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    /\S/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value) &&
    !value.startsWith("pdm:");
}

/** Normal reads require RR. Owner apply may use RC only with every local source table locked. */
export class JenfuPrincipalInventoryRepository {
  private locksVerified = false;
  constructor(
    private readonly client: Pick<AsyncDatabaseClient, "kind" | "query" | "queryOne">,
    private readonly firebaseProjectId: string,
    private readonly mode: "snapshot" | "locked_owner_apply" = "snapshot",
    private readonly sourcePolicy: PrincipalInventorySourcePolicy = "firebase_bff"
  ) {}

  async requireExactCandidate(input: PrincipalInventoryInput): Promise<PrincipalInventoryCandidate> {
    return this.readCandidate(input, 1);
  }

  async requireExactCandidateSet(inputs: PrincipalInventoryInput[]): Promise<PrincipalInventoryCandidate[]> {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2 ||
      new Set(inputs.map((input) => input?.sourceKind)).size !== inputs.length ||
      (this.sourcePolicy === "firebase_bff" &&
        (inputs.length !== 1 || inputs[0]?.sourceKind !== "firebase_mapping")) ||
      inputs.some((input) => !input || input.pdmUserId !== inputs[0].pdmUserId ||
        input.companyId !== inputs[0].companyId ||
        input.principalId !== inputs[0].principalId ||
        input.employeeId !== inputs[0].employeeId)) {
      throw new PrincipalInventoryError("principal_inventory_invalid");
    }
    const candidates: PrincipalInventoryCandidate[] = [];
    for (const input of inputs) candidates.push(await this.readCandidate(input, inputs.length));
    const first = candidates[0];
    if (candidates.some((candidate) => candidate.accountType !== first.accountType ||
      candidate.accountStatus !== first.accountStatus ||
      candidate.lifecycleVersion !== first.lifecycleVersion ||
      candidate.systemRoleEnabled !== first.systemRoleEnabled ||
      candidate.sessionInvalidBefore !== first.sessionInvalidBefore)) {
      throw new PrincipalInventoryError("principal_inventory_mismatch");
    }
    return candidates;
  }

  private async readCandidate(input: PrincipalInventoryInput, expectedSourceCount: number): Promise<PrincipalInventoryCandidate> {
    if (this.mode === "locked_owner_apply" && !this.locksVerified) {
      await requirePrincipalCutoverSourceLocks(this.client);
      this.locksVerified = true;
    }
    const publishedAt = Date.parse(input.publishedAt);
    if (this.client.kind !== "postgres" || !exactText(input.pdmUserId) ||
      !exactText(input.companyId) || !opaquePrincipal(input.principalId) ||
      !exactText(input.employeeId) || !exactText(input.identityIssuer) ||
      !exactText(input.identitySubject) ||
      !/^[a-z][a-z0-9-]{0,62}$/u.test(this.firebaseProjectId) ||
      !["firebase_mapping", "google_oauth"].includes(input.sourceKind) ||
      (this.sourcePolicy === "firebase_bff" && input.sourceKind !== "firebase_mapping") ||
      input.identityIssuer !== (input.sourceKind === "firebase_mapping"
        ? `https://securetoken.google.com/${this.firebaseProjectId}`
        : "https://accounts.google.com") ||
      !Number.isSafeInteger(input.mappingVersion) || input.mappingVersion < 1 ||
      !Number.isFinite(publishedAt)) {
      throw new PrincipalInventoryError("principal_inventory_invalid");
    }
    let rows: InventoryRow[];
    try {
      rows = await this.client.query<InventoryRow>(`
        WITH local_source AS (
          SELECT mapping.pdm_user_id AS user_id
          FROM ai_pdm_core.platform_principal_mappings mapping
          WHERE :sourceKind = 'firebase_mapping'
            AND mapping.mapping_source = 'shared_iam'
            AND mapping.mapping_status = 'active'
            AND mapping.external_subject = :identitySubject
          UNION ALL
          SELECT identity.user_id
          FROM ai_pdm_core.auth_identities identity
          WHERE :sourceKind = 'google_oauth'
            AND identity.provider = 'google_oauth'
            AND identity.status = 'active'
            AND identity.verified_at IS NOT NULL
            AND identity.provider_subject = :identitySubject
        ), source_status AS (
          SELECT count(*) AS source_count, min(user_id) AS source_user_id
          FROM local_source
        ), profile_status AS (
          SELECT count(*) FILTER (WHERE eligible) AS profile_source_count,
                 count(*) FILTER (WHERE NOT eligible) AS profile_blocker_count
          FROM (
            SELECT mapping.mapping_status = 'active' AND
                   mapping.external_subject IS NOT NULL AS eligible
            FROM ai_pdm_core.platform_principal_mappings mapping
            WHERE mapping.pdm_user_id = :pdmUserId
              AND mapping.mapping_source = 'shared_iam'
            UNION ALL
            SELECT identity.status = 'active' AND
                   identity.verified_at IS NOT NULL AS eligible
            FROM ai_pdm_core.auth_identities identity
            WHERE identity.user_id = :pdmUserId
              AND identity.provider = 'google_oauth'
              AND :sourcePolicy = 'all'
          ) eligible_sources
        ), typed AS (
          SELECT contract_version, principal_issuer, principal_subject, principal_id,
                 employee_id, employee_status, account_type, mapping_version, published_at
          FROM orgmaster_contract.v_active_principal_accounts_v1
          WHERE principal_issuer = :identityIssuer AND principal_subject = :identitySubject
          FETCH FIRST 3 ROWS ONLY
        )
        SELECT profile.id, profile.company_id, profile.account_status,
               profile.account_lifecycle_version, profile.system_role_enabled,
               profile.session_invalid_before,
               source_status.source_count, source_status.source_user_id,
               profile_status.profile_source_count, profile_status.profile_blocker_count,
               current_setting('transaction_isolation') AS isolation_level,
               typed.contract_version, typed.principal_issuer, typed.principal_subject,
               typed.principal_id, typed.employee_id, typed.employee_status,
               typed.account_type, typed.mapping_version, typed.published_at
        FROM ai_pdm_core.users profile
        CROSS JOIN source_status
        CROSS JOIN profile_status
        LEFT JOIN typed ON true
        WHERE profile.id = :pdmUserId
        FETCH FIRST 3 ROWS ONLY
      `, {
        sourceKind: input.sourceKind,
        identitySubject: input.identitySubject,
        pdmUserId: input.pdmUserId,
        identityIssuer: input.identityIssuer,
        sourcePolicy: this.sourcePolicy
      });
    } catch {
      throw new PrincipalInventoryError("principal_inventory_unavailable");
    }
    if (rows.length !== 1) throw new PrincipalInventoryError("principal_inventory_mismatch");
    const row = rows[0];
    const lifecycleVersion = Number(row.account_lifecycle_version);
    const systemRoleEnabled = Number(row.system_role_enabled);
    const mappingVersion = Number(row.mapping_version);
    const producerPublishedAt = row.published_at instanceof Date
      ? row.published_at.getTime() : Date.parse(String(row.published_at ?? ""));
    const invalidBefore = row.session_invalid_before === null ? null :
      row.session_invalid_before instanceof Date ? row.session_invalid_before.getTime() :
        Date.parse(String(row.session_invalid_before));
    if (!(this.mode === "locked_owner_apply" ? row.isolation_level === "read committed" :
      ["repeatable read", "serializable"].includes(row.isolation_level)) ||
      row.id !== input.pdmUserId || row.company_id !== input.companyId ||
      !["active", "suspended", "expired", "offboarded"].includes(row.account_status) ||
      ![0, 1].includes(systemRoleEnabled) ||
      !Number.isSafeInteger(lifecycleVersion) || lifecycleVersion < 1 ||
      (invalidBefore !== null && !Number.isFinite(invalidBefore)) ||
      Number(row.source_count) !== 1 || row.source_user_id !== input.pdmUserId ||
      Number(row.profile_source_count) !== expectedSourceCount ||
      Number(row.profile_blocker_count) !== 0 ||
      row.contract_version !== JENFU_ACTIVE_PRINCIPAL_CONTRACT_VERSION ||
      row.principal_issuer !== input.identityIssuer ||
      row.principal_subject !== input.identitySubject ||
      row.principal_id !== input.principalId || row.employee_id !== input.employeeId ||
      row.employee_status !== "active" ||
      (row.account_type !== "human_personal" && row.account_type !== "human_privileged") ||
      !Number.isSafeInteger(mappingVersion) || mappingVersion !== input.mappingVersion ||
      !Number.isFinite(producerPublishedAt) || producerPublishedAt !== publishedAt) {
      throw new PrincipalInventoryError("principal_inventory_mismatch");
    }
    return { ...input, publishedAt: new Date(producerPublishedAt).toISOString(),
      accountType: row.account_type, lifecycleVersion,
      accountStatus: row.account_status as PrincipalInventoryCandidate["accountStatus"],
      systemRoleEnabled: systemRoleEnabled === 1,
      sessionInvalidBefore: invalidBefore === null ? null : new Date(invalidBefore).toISOString() };
  }
}
