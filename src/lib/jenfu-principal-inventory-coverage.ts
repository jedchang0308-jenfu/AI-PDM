import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type CoverageRow = {
  pdm_user_id: string;
  company_id: string;
  account_status: string;
  firebase_source_count: number | string;
  firebase_active_count: number | string;
  google_source_count: number | string;
  google_verified_count: number | string;
  marker_status: string | null;
  marker_principal_id: string | null;
  marker_row_version: number | string | null;
  principal_account_status: string | null;
};

export type PrincipalInventoryCoverageProfile = {
  pdmUserId: string;
  companyId: string;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  firebaseSourceCount: number;
  firebaseActiveCount: number;
  googleSourceCount: number;
  googleVerifiedCount: number;
  markerStatus: "missing" | "legacy_compatible" | "principal_active";
  principalId: string | null;
  markerRowVersion: number;
  issues: Array<"provider_missing" | "provider_disabled_or_unverified" |
    "provider_ambiguous" | "inventory_missing" | "principal_unresolved">;
};

export class PrincipalInventoryCoverageError extends Error {
  constructor(readonly code: "principal_inventory_coverage_invalid" |
    "principal_inventory_coverage_unavailable") { super(code); }
}

function count(value: number | string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new PrincipalInventoryCoverageError("principal_inventory_coverage_invalid");
  }
  return result;
}

/** Read every local profile; never treat an absent marker as implicit legacy permission. */
export async function previewPrincipalInventoryCoverage(database: AsyncDatabaseClient) {
  if (database.kind !== "postgres") {
    throw new PrincipalInventoryCoverageError("principal_inventory_coverage_invalid");
  }
  return database.transaction(async (client) => {
    await client.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    let rows: CoverageRow[];
    try {
      rows = await client.query<CoverageRow>(`
        SELECT users.id AS pdm_user_id, users.company_id, users.account_status,
               (SELECT count(*) FROM ai_pdm_core.platform_principal_mappings mapping
                 WHERE mapping.pdm_user_id=users.id AND mapping.mapping_source='shared_iam')
                 AS firebase_source_count,
               (SELECT count(*) FROM ai_pdm_core.platform_principal_mappings mapping
                 WHERE mapping.pdm_user_id=users.id AND mapping.mapping_source='shared_iam'
                   AND mapping.mapping_status='active' AND mapping.external_subject IS NOT NULL)
                 AS firebase_active_count,
               (SELECT count(*) FROM ai_pdm_core.auth_identities identity
                 WHERE identity.user_id=users.id AND identity.provider='google_oauth')
                 AS google_source_count,
               (SELECT count(*) FROM ai_pdm_core.auth_identities identity
                 WHERE identity.user_id=users.id AND identity.provider='google_oauth'
                   AND identity.status='active' AND identity.verified_at IS NOT NULL
                   AND identity.provider_subject IS NOT NULL)
                 AS google_verified_count,
               marker.status AS marker_status, marker.principal_id AS marker_principal_id,
               marker.row_version AS marker_row_version,
               account.account_status AS principal_account_status
        FROM ai_pdm_core.users users
        LEFT JOIN ai_pdm_core.principal_identity_cutovers marker
          ON marker.pdm_user_id=users.id
        LEFT JOIN ai_pdm_core.principal_accounts account
          ON account.pdm_user_id=users.id AND account.principal_id=marker.principal_id
        ORDER BY users.id
      `);
    } catch {
      throw new PrincipalInventoryCoverageError("principal_inventory_coverage_unavailable");
    }
    const seen = new Set<string>();
    const profiles: PrincipalInventoryCoverageProfile[] = rows.map((row) => {
      const firebaseSourceCount = count(row.firebase_source_count);
      const firebaseActiveCount = count(row.firebase_active_count);
      const googleSourceCount = count(row.google_source_count);
      const googleVerifiedCount = count(row.google_verified_count);
      const markerRowVersion = row.marker_row_version === null ? 0 : count(row.marker_row_version);
      const accountStatus = row.marker_status === "principal_active"
        ? row.principal_account_status : row.account_status;
      if (!row.pdm_user_id || seen.has(row.pdm_user_id) || !row.company_id ||
        !["active", "suspended", "expired", "offboarded"].includes(accountStatus ?? "") ||
        ![null, "legacy_compatible", "principal_active"].includes(row.marker_status) ||
        (row.marker_status === null && (row.marker_principal_id !== null || markerRowVersion !== 0)) ||
        (row.marker_status !== null && markerRowVersion < 1) ||
        (row.marker_status === "principal_active" &&
          (!row.marker_principal_id || row.principal_account_status === null)) ||
        firebaseActiveCount > firebaseSourceCount || googleVerifiedCount > googleSourceCount) {
        throw new PrincipalInventoryCoverageError("principal_inventory_coverage_invalid");
      }
      seen.add(row.pdm_user_id);
      const issues: PrincipalInventoryCoverageProfile["issues"] = [];
      if (row.marker_status !== "principal_active") {
        if (firebaseSourceCount + googleSourceCount === 0) issues.push("provider_missing");
        if (firebaseActiveCount < firebaseSourceCount || googleVerifiedCount < googleSourceCount) {
          issues.push("provider_disabled_or_unverified");
        }
        if (firebaseSourceCount > 1 || googleSourceCount > 1) issues.push("provider_ambiguous");
        if (row.marker_status === null) issues.push("inventory_missing");
        if (row.marker_status === "legacy_compatible" && !row.marker_principal_id) {
          issues.push("principal_unresolved");
        }
      }
      return {
        pdmUserId: row.pdm_user_id, companyId: row.company_id,
        accountStatus: accountStatus as PrincipalInventoryCoverageProfile["accountStatus"],
        firebaseSourceCount, firebaseActiveCount, googleSourceCount, googleVerifiedCount,
        markerStatus: (row.marker_status ?? "missing") as PrincipalInventoryCoverageProfile["markerStatus"],
        principalId: row.marker_principal_id, markerRowVersion, issues
      };
    });
    const activeProfiles = profiles.filter((profile) => profile.accountStatus === "active");
    return {
      schemaVersion: "ai-pdm.principal-inventory-coverage.v1" as const,
      profiles,
      totalProfiles: profiles.length,
      activeProfiles: activeProfiles.length,
      activePrincipalProfiles: activeProfiles.filter((profile) =>
        profile.markerStatus === "principal_active").length,
      activeUnresolvedProfiles: activeProfiles.filter((profile) =>
        profile.markerStatus !== "principal_active" || profile.issues.length > 0).length
    };
  }, { isolationLevel: "repeatable_read", readOnly: true });
}
