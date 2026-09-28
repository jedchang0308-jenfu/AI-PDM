import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type ProfileRow = {
  pdm_user_id: string;
  company_id: string;
  historical_status: string;
  historical_status_reason: string | null;
  principal_id: string | null;
  employee_id: string | null;
  account_type: string | null;
  principal_status: string | null;
  system_role_enabled: boolean | null;
  marker_status: string | null;
  marker_principal_id: string | null;
  marker_source_hash: string | null;
  operation_id: string | null;
  operation_kind: string | null;
  operation_input_hash: string | null;
  operation_cohort_hash: string | null;
  operation_result: unknown;
};
type PublishedRow = {
  pdm_user_id: string;
  principal_id: string;
  contract_version: string | null;
  employee_id: string | null;
  account_type: string | null;
  employee_status: string | null;
  identity_issuer: string | null;
  identity_subject: string | null;
  mapping_version: number | string | null;
};
type ProviderRow = {
  pdm_user_id: string;
  identity_issuer: string;
  identity_subject: string | null;
  eligible: boolean;
};

export type PrincipalOnlyCohortIssue =
  | "principal_account_missing" | "principal_account_disabled"
  | "historically_disabled_reactivated" | "activation_unconfirmed"
  | "published_principal_missing" | "published_principal_mismatch"
  | "published_login_pair_missing" | "published_pair_ambiguous" | "provider_pair_missing"
  | "provider_pair_unverified" | "provider_pair_ambiguous";

export class PrincipalOnlyCohortReadbackError extends Error {
  constructor() { super("principal_only_cohort_readback_unavailable"); }
}

function active(value: string) {
  return value === "active";
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function operationMatchesProfile(profile: ProfileRow): boolean {
  if (!profile.principal_id || !profile.operation_id ||
    !isHash(profile.marker_source_hash) || !isHash(profile.operation_input_hash) ||
    !isHash(profile.operation_cohort_hash) || !profile.operation_result ||
    typeof profile.operation_result !== "object" ||
    Array.isArray(profile.operation_result)) return false;
  const result = profile.operation_result as Record<string, unknown>;
  if (result.operationId !== profile.operation_id) return false;
  if (profile.operation_kind === "provision") {
    return result.principalId === profile.principal_id &&
      result.pdmUserId === profile.pdm_user_id &&
      profile.marker_source_hash === profile.operation_input_hash;
  }
  if (profile.operation_kind !== "cutover" ||
    result.contractVersion !== "ai-pdm.principal-cutover-result.v1" ||
    result.sourceHash !== profile.marker_source_hash ||
    result.cohortHash !== profile.operation_cohort_hash ||
    !Array.isArray(result.principals) ||
    !result.principals.every((item) => typeof item === "string" && item.length > 0) ||
    new Set(result.principals).size !== result.principals.length ||
    result.accountCount !== result.principals.length) return false;
  return result.principals.includes(profile.principal_id);
}

/** Discovery only: no row in this receipt can create an identity or a grant. */
export async function readPrincipalOnlyCohort(
  database: AsyncDatabaseClient,
  firebaseProjectId = "jenfu-platform-prod"
) {
  if (database.kind !== "postgres" || !/^[a-z][a-z0-9-]{0,62}$/u.test(firebaseProjectId)) {
    throw new PrincipalOnlyCohortReadbackError();
  }
  return database.transaction(async (snapshot) => {
    await snapshot.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    let profiles: ProfileRow[];
    let published: PublishedRow[];
    let providers: ProviderRow[];
    try {
      profiles = await snapshot.query<ProfileRow>(`
        SELECT profile.id AS pdm_user_id,profile.company_id,
               profile.account_status AS historical_status,
               profile.account_status_reason AS historical_status_reason,
               account.principal_id,account.employee_id,account.account_type,
               account.account_status AS principal_status,account.system_role_enabled,
               marker.status AS marker_status,
               marker.principal_id AS marker_principal_id,
               marker.source_hash AS marker_source_hash,marker.operation_id,
               operation.operation_kind,operation.input_hash AS operation_input_hash,
               operation.cohort_hash AS operation_cohort_hash,
               operation.result_json AS operation_result
        FROM ai_pdm_core.users profile
        LEFT JOIN ai_pdm_core.principal_accounts account
          ON account.pdm_user_id=profile.id AND account.company_id=profile.company_id
        LEFT JOIN ai_pdm_core.principal_identity_cutovers marker
          ON marker.pdm_user_id=profile.id
        LEFT JOIN ai_pdm_core.principal_identity_operations operation
          ON operation.operation_id=marker.operation_id
        ORDER BY profile.id
      `);
      published = await snapshot.query<PublishedRow>(`
        SELECT account.pdm_user_id,account.principal_id,typed.contract_version,
               typed.employee_id,typed.account_type,typed.employee_status,
               typed.principal_issuer AS identity_issuer,
               typed.principal_subject AS identity_subject,typed.mapping_version
        FROM ai_pdm_core.principal_accounts account
        LEFT JOIN orgmaster_contract.v_active_principal_accounts_v1 typed
          ON typed.principal_id=account.principal_id
        ORDER BY account.pdm_user_id,typed.principal_issuer,typed.principal_subject
      `);
      providers = await snapshot.query<ProviderRow>(`
        SELECT mapping.pdm_user_id,:firebaseIssuer AS identity_issuer,
               mapping.external_subject AS identity_subject,
               mapping.mapping_status='active' AND mapping.external_subject IS NOT NULL
                 AS eligible
        FROM ai_pdm_core.platform_principal_mappings mapping
        WHERE mapping.mapping_source='shared_iam'
        ORDER BY mapping.pdm_user_id,mapping.external_subject
      `, { firebaseIssuer: `https://securetoken.google.com/${firebaseProjectId}` });
    } catch {
      throw new PrincipalOnlyCohortReadbackError();
    }
    const publishedByProfile = new Map<string, PublishedRow[]>();
    const providersByProfile = new Map<string, ProviderRow[]>();
    const publishedPairOwners = new Map<string, Set<string>>();
    const providerPairOwners = new Map<string, Set<string>>();
    for (const row of published) {
      const rows = publishedByProfile.get(row.pdm_user_id) ?? [];
      rows.push(row);
      publishedByProfile.set(row.pdm_user_id, rows);
      if (row.identity_issuer && row.identity_subject) {
        const pair = JSON.stringify([row.identity_issuer, row.identity_subject]);
        const owners = publishedPairOwners.get(pair) ?? new Set<string>();
        owners.add(row.pdm_user_id);
        publishedPairOwners.set(pair, owners);
      }
    }
    for (const row of providers) {
      const rows = providersByProfile.get(row.pdm_user_id) ?? [];
      rows.push(row);
      providersByProfile.set(row.pdm_user_id, rows);
      if (row.identity_subject) {
        const pair = JSON.stringify([row.identity_issuer, row.identity_subject]);
        const owners = providerPairOwners.get(pair) ?? new Set<string>();
        owners.add(row.pdm_user_id);
        providerPairOwners.set(pair, owners);
      }
    }
    const seen = new Set<string>();
    const result = profiles.map((profile) => {
      if (!profile.pdm_user_id || !profile.company_id || seen.has(profile.pdm_user_id) ||
        !["active", "suspended", "expired", "offboarded"].includes(profile.historical_status) ||
        (profile.principal_id !== null && (!profile.employee_id || !profile.account_type ||
          !["active", "suspended", "expired", "offboarded"].includes(profile.principal_status ?? "") ||
          typeof profile.system_role_enabled !== "boolean")) ||
        (profile.principal_id === null && profile.principal_status !== null)) {
        throw new PrincipalOnlyCohortReadbackError();
      }
      seen.add(profile.pdm_user_id);
      const issues: PrincipalOnlyCohortIssue[] = [];
      const historicalActive = active(profile.historical_status);
      const accountActive = active(profile.principal_status ?? "") && profile.system_role_enabled === true;
      const activationProven = operationMatchesProfile(profile);
      if (historicalActive && !profile.principal_id) issues.push("principal_account_missing");
      if (profile.principal_id && historicalActive && !accountActive) issues.push("principal_account_disabled");
      const principalOnlyProvision = profile.historical_status === "suspended" &&
        profile.historical_status_reason === "principal_only_provision" &&
        profile.operation_kind === "provision" && activationProven;
      if (!historicalActive && accountActive && !principalOnlyProvision) {
        issues.push("historically_disabled_reactivated");
      }
      if (profile.principal_id && accountActive &&
        (profile.marker_status !== "principal_active" ||
          profile.marker_principal_id !== profile.principal_id || !activationProven)) {
        issues.push("activation_unconfirmed");
      }
      const producer = publishedByProfile.get(profile.pdm_user_id) ?? [];
      if (profile.principal_id && accountActive) {
        const loginPairs = producer.filter((row) =>
          row.identity_issuer === `https://securetoken.google.com/${firebaseProjectId}` &&
          row.identity_subject);
        if (!producer.some((row) => row.identity_issuer && row.identity_subject)) {
          issues.push("published_principal_missing");
        } else if (producer.some((row) => row.contract_version !== "organization.active-principal.v1" ||
          row.principal_id !== profile.principal_id ||
          row.employee_id !== profile.employee_id || row.account_type !== profile.account_type ||
          row.employee_status !== "active" || !row.identity_issuer || !row.identity_subject ||
          !Number.isSafeInteger(Number(row.mapping_version)) || Number(row.mapping_version) < 1)) {
          issues.push("published_principal_mismatch");
        }
        if (loginPairs.length < 1 || loginPairs.length > 2) {
          issues.push("published_login_pair_missing");
        }
        const producerPairs = producer.filter((row) => row.identity_issuer && row.identity_subject)
          .map((row) => JSON.stringify([row.identity_issuer, row.identity_subject]));
        if (producerPairs.length !== new Set(producerPairs).size ||
          producerPairs.some((pair) => (publishedPairOwners.get(pair)?.size ?? 0) !== 1)) {
          issues.push("published_pair_ambiguous");
        }
        const local = providersByProfile.get(profile.pdm_user_id) ?? [];
        // New Principal accounts are provisioned against the published provider pair
        // in the owner transaction. They intentionally have no legacy UID mapping.
        if (local.length === 0 && !principalOnlyProvision) issues.push("provider_pair_missing");
        else if (local.some((row) => !row.eligible || !row.identity_subject ||
          !producer.some((item) => item.identity_issuer === row.identity_issuer &&
            item.identity_subject === row.identity_subject &&
            item.principal_id === profile.principal_id))) {
          issues.push("provider_pair_unverified");
        }
        const localPairs = local.filter((row) => row.identity_subject)
          .map((row) => JSON.stringify([row.identity_issuer, row.identity_subject]));
        if (localPairs.length !== new Set(localPairs).size ||
          localPairs.some((pair) => (providerPairOwners.get(pair)?.size ?? 0) !== 1)) {
          issues.push("provider_pair_ambiguous");
        }
      }
      return {
        pdmUserId: profile.pdm_user_id, companyId: profile.company_id,
        principalId: profile.principal_id, employeeId: profile.employee_id,
        historicalStatus: profile.historical_status,
        principalStatus: profile.principal_status,
        issues
      };
    });
    if (published.some((row) => !seen.has(row.pdm_user_id)) ||
      providers.some((row) => !seen.has(row.pdm_user_id))) {
      throw new PrincipalOnlyCohortReadbackError();
    }
    return {
      schemaVersion: "ai-pdm.principal-only-cohort-readback.v1" as const,
      profiles: result,
      totalProfiles: result.length,
      activeHistoricalProfiles: result.filter((row) => active(row.historicalStatus)).length,
      activePrincipalProfiles: result.filter((row) => row.principalStatus === "active" &&
        row.issues.length === 0).length,
      unresolvedProfiles: result.filter((row) => row.issues.length > 0).length
    };
  }, { isolationLevel: "repeatable_read", readOnly: true });
}
